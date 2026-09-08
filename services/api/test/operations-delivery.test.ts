import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { createDatabase } from '../src/database/database.js';
import { readEnvironment } from '../src/config/env.js';
import { hashToken } from '../src/modules/auth/identity-service.js';
import { registerRequestBudgets } from '../src/modules/auth/request-budget.js';
import { RazorpayProvider } from '../src/modules/payments/razorpay.js';
import { RefundService } from '../src/modules/payments/refunds.js';
import { deliverNotifications } from '../src/modules/notifications/delivery.js';
import { WhatsAppNotificationProvider } from '../src/modules/notifications/whatsapp-provider.js';
import { WhatsAppService } from '../src/modules/assistant/whatsapp.js';

test('durable budgets, refund confirmation and notification delivery', { skip: process.env.AUTH_INTEGRATION !== 'true' || !process.env.DATABASE_URL }, async t => {
  const database = createDatabase(process.env.DATABASE_URL!), db = database.client!; t.after(() => database.close());
  const env = readEnvironment({ APP_ENV: 'test', WHATSAPP_MODE: 'webhook', WHATSAPP_OUTBOUND: 'cloud', WHATSAPP_APP_SECRET: randomBytes(32).toString('hex'),
    WHATSAPP_VERIFY_TOKEN: randomBytes(32).toString('hex'), WHATSAPP_PHONE_NUMBER_ID: '123456', WHATSAPP_ACCESS_TOKEN: randomBytes(32).toString('hex'), WHATSAPP_API_VERSION: 'v23.0' });
  const user = await db.user.create({ data: { fullName: 'DEMO operations delivery', notifications: true, roles: { create: { role: 'USER' } } } });
  await t.test('per-user budget survives changing IP and application instance', async () => {
    const token = randomBytes(32).toString('base64url');
    await db.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000) } });
    const apps = [Fastify(), Fastify()], instant = Date.now();
    for (const app of apps) { registerRequestBudgets(app, env, db, () => instant); app.post('/api/v1/checkout', async () => ({ ok: true })); }
    try {
      // Two concurrent replicas race the final remaining allowance. This is a
      // correctness test, not an unbounded connection-pool/load benchmark.
      const send = (i: number) => apps[i % 2]!.inject({ method: 'POST', url: '/api/v1/checkout', remoteAddress: `127.8.0.${i + 1}`, headers: { authorization: `Bearer ${token}` } });
      const responses = [await send(0)];
      for (let i = 1; i < 61; i += 2) responses.push(...await Promise.all([send(i), send(i + 1)]));
      assert.equal(responses.filter(r => r.statusCode === 200).length, 60);
      assert.equal(responses.filter(r => r.statusCode === 429).length, 1);
    } finally { await Promise.all(apps.map(a => a.close())); }
  });
  const category = await db.programCategory.create({ data: { id: randomUUID(), name: `DEMO ${randomUUID()}` } });
  const doctor = await db.doctor.create({ data: { name: 'DEMO', qualification: 'DEMO — no credentials', specialty: 'DEMO', biography: 'Synthetic', isDemo: true } });
  const program = await db.program.create({ data: { title: 'DEMO refund test', description: 'Synthetic', audience: 'Tests', outcomes: [], type: 'RECORDED', durationMinutes: 1, pricePaise: 500, isDemo: true, doctorId: doctor.id, categoryId: category.id } });
  // Historical synthetic ledger fixtures stay outside current revenue report windows.
  const makePayment = () => db.enrollmentPayment.create({ data: { userId: user.id, programId: program.id, amountPaise: 500, currency: 'INR', provider: 'razorpay', providerReference: `pay_${randomBytes(8).toString('hex')}`, status: 'VERIFIED', createdAt: new Date(0), verifiedAt: new Date(0), refundStatus: 'REFUND_REQUESTED' } });
  await t.test('refund stays pending until provider confirms and never posts twice', async () => {
    const payment = await makePayment(); let posts = 0, processed = false;
    const provider = new RazorpayProvider({ mode: 'test', keyId: 'rzp_test_Disposable', keySecret: randomBytes(32).toString('hex') }, async (_, init) => {
      if (init?.method === 'POST') posts++;
      return Response.json({ id: 'rfnd_Confirmed', payment_id: payment.providerReference, amount: 500, currency: 'INR', status: processed ? 'processed' : 'pending' });
    });
    const service = new RefundService(db, env, provider);
    assert.equal((await service.process(payment.id, randomUUID())).status, 'REFUND_PROCESSING');
    await assert.rejects(service.process(payment.id, randomUUID())); assert.equal(posts, 1);
    assert.equal((await db.enrollmentPayment.findUniqueOrThrow({ where: { id: payment.id } })).refundStatus, 'REFUND_PROCESSING');
    processed = true;
    assert.equal((await service.reconcile(payment.id)).status, 'REFUNDED');
    assert.equal((await service.reconcile(payment.id)).status, 'REFUNDED'); assert.equal(posts, 1);
  });
  await t.test('ambiguous refund transport failure requires reconciliation, not another POST', async () => {
    const payment = await makePayment(); let posts = 0;
    const provider = new RazorpayProvider({ mode: 'test', keyId: 'rzp_test_Disposable', keySecret: randomBytes(32).toString('hex') }, async () => { posts++; throw Error('unknown transport outcome'); });
    const service = new RefundService(db, env, provider);
    await assert.rejects(service.process(payment.id, randomUUID()));
    await assert.rejects(service.process(payment.id, randomUUID()));
    assert.equal(posts, 1);
    assert.equal((await db.providerEvent.findUniqueOrThrow({ where: { provider_eventId: { provider: 'razorpay', eventId: `refund:${payment.id}` } } })).status, 'RECONCILIATION_REQUIRED');
  });
  await db.aIPreferences.create({ data: { userId: user.id, whatsappReminders: true } });
  const waId = `919${Date.now()}`;
  await db.whatsAppIdentity.create({ data: { userId: user.id, waId } });
  await db.consentRecord.create({ data: { userId: user.id, type: 'WHATSAPP', version: '1', granted: true } });
  const add = () => db.notification.create({ data: { userId: user.id, sourceKey: randomUUID(), kind: 'account', route: '/profile', channel: 'WHATSAPP', status: 'PENDING' } });
  await t.test('accepted notification is not redelivered; signed statuses are monotonic and recipient-bound', async () => {
    const n = await add(); let sends = 0;
    const reference = `wamid.${randomUUID()}`;
    const provider = new WhatsAppNotificationProvider(env, async () => { sends++; return Response.json({ messages: [{ id: reference }] }); });
    await deliverNotifications(db, env, provider); await deliverNotifications(db, env, provider);
    assert.equal(sends, 1);
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).status, 'SENT');
    const service = new WhatsAppService(db, env);
    await service.deliveryStatus(reference, `${waId}0`, 'read', '1', randomUUID());
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).status, 'SENT');
    await service.deliveryStatus(reference, waId, 'read', '2', randomUUID());
    await service.deliveryStatus(reference, waId, 'sent', '1', randomUUID());
    await service.deliveryStatus(reference, waId, 'failed', '3', randomUUID());
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).status, 'READ');
  });
  await t.test('uncertain sends are not retried; revocation is checked before transport', async () => {
    const n = await add(); let sends = 0;
    const provider = new WhatsAppNotificationProvider(env, async () => { sends++; throw Error('unknown transport'); });
    await deliverNotifications(db, env, provider); await deliverNotifications(db, env, provider);
    assert.equal(sends, 1); assert.equal((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).status, 'UNKNOWN');
    const disabledProgram = await db.notification.create({ data: { userId: user.id, sourceKey: randomUUID(), kind: 'program', route: '/programs', channel: 'WHATSAPP', status: 'PENDING' } });
    await deliverNotifications(db, env, provider); assert.equal(sends, 1);
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: disabledProgram.id } })).status, 'CANCELLED');
    const revoked = await add(); await db.consentRecord.create({ data: { userId: user.id, type: 'WHATSAPP', version: '1', granted: false } });
    await deliverNotifications(db, env, provider); assert.equal(sends, 1);
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: revoked.id } })).status, 'CANCELLED');
  });
});
