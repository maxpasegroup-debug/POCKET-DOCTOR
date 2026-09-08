import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { RazorpayProvider } from '../src/modules/payments/razorpay.js';
import { WhatsAppNotificationProvider } from '../src/modules/notifications/whatsapp-provider.js';
import { readEnvironment } from '../src/config/env.js';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/database/database.js';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
test('Razorpay order, captured payment and refund verification use fixed provider and persisted facts', async () => {
  const secret = randomBytes(32).toString('hex'), id = randomUUID(); let calls = 0;
  const adapter = new RazorpayProvider({ mode: 'test', keyId: 'rzp_test_Disposable', keySecret: secret }, async (url, init) => {
    calls++; assert.ok(String(url).startsWith('https://api.razorpay.com/v1/')); assert.equal(init?.redirect, 'error');
    if (String(url).endsWith('/orders')) return json({ id: 'order_Test', amount: 500, currency: 'INR', receipt: id, status: 'created' });
    if (String(url).endsWith('/payments/pay_Test')) return json({ id: 'pay_Test', order_id: 'order_Test', amount: 500, currency: 'INR', status: 'captured', captured: true, amount_refunded: 0 });
    return json({ id: 'rfnd_Test', payment_id: 'pay_Test', amount: 500, currency: 'INR', status: 'processed' });
  });
  assert.equal((await adapter.createOrder({ ledgerId: id, amountPaise: 500, currency: 'INR' })).id, 'order_Test');
  assert.equal((await adapter.verifyPayment({ paymentId: 'pay_Test', orderId: 'order_Test', amountPaise: 500, currency: 'INR' })).captured, true);
  await assert.rejects(adapter.verifyPayment({ paymentId: 'pay_Test', orderId: 'order_Other', amountPaise: 500, currency: 'INR' }));
  await assert.rejects(adapter.verifyPayment({ paymentId: 'pay_Test', orderId: 'order_Test', amountPaise: 1, currency: 'INR' }));
  assert.equal((await adapter.requestRefund('pay_Test', 500, id)).status, 'processed');
  assert.equal((await adapter.verifyRefund('rfnd_Test', 'pay_Test', 500)).status, 'processed');
  const signature = createHmac('sha256', secret).update('order_Test|pay_Test').digest('hex');
  assert.equal(adapter.verifyCheckoutSignature('order_Test', 'pay_Test', signature), true);
  assert.equal(adapter.verifyCheckoutSignature('order_Other', 'pay_Test', signature), false);
  assert.equal(calls, 6);
});
test('provider errors and oversized responses fail safely without automatic money-moving retries', async () => {
  let calls = 0; const secret = randomBytes(32).toString('hex');
  const adapter = new RazorpayProvider({ mode: 'test', keyId: 'rzp_test_Disposable', keySecret: secret }, async () => { calls++; throw new Error(secret); });
  await assert.rejects(adapter.createOrder({ ledgerId: randomUUID(), amountPaise: 500, currency: 'INR' }), e => !String(e).includes(secret)); assert.equal(calls, 1);
  const big = new RazorpayProvider({ mode: 'test', keyId: 'rzp_test_Disposable', keySecret: secret }, async () => new Response('x'.repeat(66000)));
  await assert.rejects(big.verifyRefund('rfnd_Test', 'pay_Test', 500));
});
test('WhatsApp outbound needs consent and an open service window, and acceptance is not delivery', async () => {
  const env = readEnvironment({ APP_ENV: 'test', WHATSAPP_MODE: 'webhook', WHATSAPP_OUTBOUND: 'cloud', WHATSAPP_APP_SECRET: randomBytes(32).toString('hex'), WHATSAPP_VERIFY_TOKEN: randomBytes(32).toString('hex'),
    WHATSAPP_PHONE_NUMBER_ID: '123456', WHATSAPP_ACCESS_TOKEN: randomBytes(32).toString('hex'), WHATSAPP_API_VERSION: 'v23.0' });
  let calls = 0; const provider = new WhatsAppNotificationProvider(env, async (url, init) => {
    calls++; assert.equal(String(url), 'https://graph.facebook.com/v23.0/123456/messages');
    assert.ok(!String(init?.body).includes('diagnosis')); return json({ messages: [{ id: 'wamid.Test' }] });
  });
  assert.equal((await provider.send('919999900707', new Date(), false)).status, 'CANCELLED');
  assert.equal((await provider.send('919999900707', new Date(Date.now() - 86400001), true)).status, 'CANCELLED'); assert.equal(calls, 0);
  assert.equal((await provider.send('919999900707', new Date(Date.now() - 1000), true)).status, 'SENT'); assert.equal(calls, 1);
  const unknown = new WhatsAppNotificationProvider(env, async () => { throw new Error('timeout'); });
  assert.equal((await unknown.send('919999900707', new Date(Date.now() - 1000), true)).status, 'UNKNOWN');
});
test('signed payment webhook persists once and never grants access from a callback', { skip: process.env.AUTH_INTEGRATION !== 'true' || !process.env.DATABASE_URL }, async t => {
  const db = createDatabase(process.env.DATABASE_URL!), secret = randomBytes(32).toString('hex');
  const app = await buildApp(readEnvironment({ APP_ENV: 'test', RAZORPAY_WEBHOOK_SECRET: secret }), db); t.after(() => app.close());
  const eventId = randomUUID(), body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_Test' } } } });
  const headers = { 'content-type': 'application/json', 'x-razorpay-event-id': eventId, 'x-razorpay-signature': createHmac('sha256', secret).update(body).digest('hex') };
  const route = '/api/v1/payments/razorpay/webhook';
  assert.equal((await app.inject({ method: 'POST', url: route, headers: { ...headers, 'x-razorpay-signature': '0'.repeat(64) }, payload: body })).statusCode, 401);
  const [a, b] = await Promise.all([app.inject({ method: 'POST', url: route, headers, payload: body }), app.inject({ method: 'POST', url: route, headers, payload: body })]);
  assert.equal(a.statusCode, 200); assert.equal(b.statusCode, 200);
  assert.equal(await db.client!.providerEvent.count({ where: { provider: 'razorpay', eventId } }), 1);
  assert.equal((await db.client!.providerEvent.findFirstOrThrow({ where: { eventId } })).status, 'RECONCILIATION_REQUIRED');
  assert.equal(await db.client!.enrollmentPayment.count({ where: { providerReference: 'pay_Test' } }), 0);
});
