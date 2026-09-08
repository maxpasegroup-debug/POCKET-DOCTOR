import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, randomBytes } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { readEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/database/database.js';
import { hashToken } from '../src/modules/auth/identity-service.js';
import { MembershipService } from '../src/modules/membership/membership-service.js';
import { entitled, memberPrice } from '../src/modules/membership/entitlements.js';
import { couponInput, subscribeInput, discountPrice, periodEnd } from '../src/modules/membership/contracts.js';
import { AIContextBuilder } from '../src/modules/assistant/context-builder.js';
import { ProgramService } from '../src/modules/programs/program-service.js';
import { CommerceService } from '../src/modules/wellness/commerce-service.js';
import { ConsultationService } from '../src/modules/consultations/consultation-service.js';

test('membership input rejects client prices/status and computes bounded offers and calendar periods', () => {
  assert.equal(subscribeInput.safeParse({ planId: randomUUID(), requestKey: randomUUID(), pricePaise: 1 }).success, false);
  assert.equal(subscribeInput.safeParse({ planId: randomUUID(), requestKey: randomUUID(), status: 'ACTIVE' }).success, false);
  assert.equal(discountPrice(999, 'PERCENT', 10), 900);
  assert.equal(discountPrice(999, 'FIXED', 5000), 0);
  assert.equal(periodEnd(new Date('2024-01-31T12:00:00Z'), 'MONTH').toISOString(), '2024-02-29T12:00:00.000Z');
  assert.equal(periodEnd(new Date('2024-02-29T12:00:00Z'), 'YEAR').toISOString(), '2025-02-28T12:00:00.000Z');
  assert.equal(couponInput.safeParse({ code: 'BAD', type: 'PERCENT', value: 101 }).success, false);
});

test('Phase 6 PostgreSQL subscriptions, coupons, receipts, ownership and access', { skip: process.env.AUTH_INTEGRATION !== 'true' || !process.env.DATABASE_URL }, async t => {
  const database = createDatabase(process.env.DATABASE_URL!); const db = database.client!;
  const env = readEnvironment({ APP_ENV: 'test', PAYMENT_MODE: 'development', DEMO_PROGRAMS: 'true', DEMO_WELLNESS: 'true', DEMO_CONSULTATIONS: 'true' });
  const app = await buildApp(env, database); const service = new MembershipService(db, env);
  const users = await Promise.all([0, 1, 2, 3, 4, 5].map(i => db.user.create({ data: { roles: { create: { role: i === 2 ? 'ADMIN' : 'USER' } } } })));
  const tokens = users.map(() => randomBytes(32).toString('base64url'));
  await db.session.createMany({ data: users.map((u, i) => ({ userId: u.id, tokenHash: hashToken(tokens[i]!), expiresAt: new Date(Date.now() + 3600000) })) });
  const user = users[0]!.id, other = users[1]!.id;
  const resource = randomUUID();
  const plan = await db.membershipPlan.create({ data: { slug: `test-${randomUUID()}`, name: 'DEMO Pocket Doctor Plus', description: 'Test membership', pricePaise: 9900, interval: 'MONTH', active: true, isDemo: true, trialDays: 7, graceDays: 2,
    benefits: { create: [{ key: 'PROGRAM_ACCESS', label: 'Selected demo programs', resourceIds: [resource] }, { key: 'CONSULTATION_DISCOUNT', label: '10% on the selected demo consultation', resourceIds: [resource], value: 10 }] } } });
  const annual = await db.membershipPlan.create({ data: { slug: `test-${randomUUID()}`, name: 'DEMO Annual', description: 'Test annual membership', pricePaise: 99000, interval: 'YEAR', active: true, isDemo: true } });
  const coupon = await db.coupon.create({ data: { code: `T${randomUUID()}`.toUpperCase(), type: 'PERCENT', value: 20, active: true, startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 86400000), usageLimit: 2, perUserLimit: 1, plans: { create: { planId: plan.id } } } });
  const ids = users.map(u => u.id);
  t.after(async () => {
    await db.couponRedemption.deleteMany({ where: { userId: { in: ids } } });
    await db.enrollmentPayment.deleteMany({ where: { userId: { in: ids } } });
    await db.subscription.deleteMany({ where: { userId: { in: ids } } });
    await db.coupon.delete({ where: { id: coupon.id } });
    await db.membershipPlan.deleteMany({ where: { id: { in: [plan.id, annual.id] } } });
    await db.user.deleteMany({ where: { id: { in: ids } } }); await app.close();
  });
  let counter = 0;
  const call = (path: string, body?: object, actor = 0) => app.inject({ method: body ? 'POST' : 'GET', url: `/api/v1${path}`, remoteAddress: `127.6.0.${++counter}`, headers: { authorization: `Bearer ${tokens[actor]}` }, ...(body ? { payload: body } : {}) });
  const input = (extra = {}) => ({ planId: plan.id, requestKey: randomUUID(), coupon: '', trial: false, renew: false, ...extra });
  let paymentId = '', subscriptionId = '';
  await t.test('auth, plan retrieval, strict requests and admin boundary', async () => {
    assert.equal((await app.inject('/api/v1/membership/plans')).statusCode, 401);
    assert.equal((await call('/membership/plans')).json().data.items.length >= 2, true);
    assert.equal((await call('/admin/revenue')).statusCode, 403);
    assert.equal((await call('/membership/subscribe', { ...input(), amountPaise: 1 })).statusCode, 400);
    assert.equal((await call('/membership/subscribe', input({ planId: randomUUID() }))).statusCode, 404);
    assert.equal(await entitled(db, env, user, 'PROGRAM_ACCESS', resource), false);
    assert.equal((await call('/admin/membership/plans', {}, 0)).statusCode, 403);
  });
  await t.test('coupon validation, wrong plan, expiry and unknown code', async () => {
    const r = await call('/membership/coupon/validate', { planId: plan.id, coupon: coupon.code });
    assert.equal(r.json().data.amountPaise, 7920); assert.equal(r.json().data.renewalPricePaise, 9900);
    assert.equal((await call('/membership/coupon/validate', { planId: annual.id, coupon: coupon.code })).statusCode, 400);
    assert.equal((await call('/membership/coupon/validate', { planId: plan.id, coupon: 'UNKNOWN' })).statusCode, 400);
    await db.coupon.update({ where: { id: coupon.id }, data: { startsAt: new Date(Date.now() - 120000), endsAt: new Date(Date.now() - 60000) } });
    assert.equal((await call('/membership/coupon/validate', { planId: plan.id, coupon: coupon.code })).statusCode, 400);
    await db.coupon.update({ where: { id: coupon.id }, data: { endsAt: new Date(Date.now() + 86400000) } });
  });
  await t.test('concurrent subscriptions create one pending membership and reserve coupon once', async () => {
    const results = await Promise.all([call('/membership/subscribe', input({ coupon: coupon.code })), call('/membership/subscribe', input({ coupon: coupon.code }))]);
    assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
    const data = results.find(r => r.statusCode === 200)!.json().data;
    paymentId = data.payment.id; subscriptionId = data.subscription.id;
    assert.equal(data.payment.amountPaise, 7920);
    assert.equal(await db.subscription.count({ where: { userId: user } }), 1);
    assert.equal(await db.couponRedemption.count({ where: { userId: user } }), 1);
    assert.equal(await entitled(db, env, user, 'PROGRAM_ACCESS', resource), false);
    assert.equal((await call(`/membership/payments/${paymentId}/development-settle`, { outcome: 'capture' }, 1)).statusCode, 404);
  });
  await t.test('payment callbacks are idempotent: one payment, activation, revenue row and receipt', async () => {
    const replies = await Promise.all(Array.from({ length: 4 }, () => call(`/membership/payments/${paymentId}/development-settle`, { outcome: 'capture' })));
    assert.ok(replies.every(r => r.statusCode === 200 && r.json().data.verified));
    assert.equal(await db.enrollmentPayment.count({ where: { subscriptionId, status: 'VERIFIED' } }), 1);
    assert.equal(await db.invoice.count({ where: { paymentId } }), 1);
    assert.equal(await db.subscriptionEvent.count({ where: { subscriptionId, kind: 'membership_purchased' } }), 1);
    assert.equal(await entitled(db, env, user, 'PROGRAM_ACCESS', resource), true);
    assert.equal(await entitled(db, env, user, 'PROGRAM_ACCESS', randomUUID()), false);
    assert.equal(await memberPrice(db, env, user, 'CONSULTATION_DISCOUNT', 999, resource), 900);
    const facts = await new AIContextBuilder(db, env, user).facts('membership'); assert.equal(facts[0]!.value.includes(plan.name), true);
  });
  await t.test('per-user coupon usage, cross-user invoices/history and revenue authorization', async () => {
    assert.equal((await call('/membership/coupon/validate', { planId: plan.id, coupon: coupon.code })).statusCode, 400);
    const invoice = await db.invoice.findUniqueOrThrow({ where: { paymentId } });
    assert.equal((await call(`/me/invoices/${invoice.id}`, undefined, 1)).statusCode, 404);
    assert.equal((await call(`/me/invoices/${invoice.id}`)).json().data.item.source, 'MEMBERSHIP');
    assert.equal((await call('/me/revenue/transactions', undefined, 1)).json().data.items.length, 0);
    assert.equal((await call(`/membership/${subscriptionId}/cancel`, {}, 1)).statusCode, 404);
    assert.equal((await call('/membership/history', undefined, 1)).json().data.items.length, 0);
    const report = await call('/admin/revenue?demo=true', undefined, 2);
    assert.equal(report.statusCode, 200);
    assert.ok(report.json().data.monthly.some((v: { source: string; status: string; amountPaise: number }) => v.source === 'MEMBERSHIP' && v.status === 'VERIFIED' && v.amountPaise >= 7920));
    assert.ok(report.json().data.totals.some((v: { status: string; _sum: { amountPaise: number } }) => v.status === 'VERIFIED' && v._sum.amountPaise >= 7920));
    const live = (await call('/admin/revenue', undefined, 2)).json().data; assert.equal(live.revenue.length, 0);
  });
  await t.test('cancellation retains access; reactivation and time-based expiration', async () => {
    assert.equal((await call(`/membership/${subscriptionId}/cancel`, {})).statusCode, 200);
    assert.equal(await entitled(db, env, user, 'PROGRAM_ACCESS', resource), true);
    assert.equal((await call(`/membership/${subscriptionId}/reactivate`, {})).statusCode, 200);
    await db.subscription.update({ where: { id: subscriptionId }, data: { periodStart: new Date(Date.now() - 86400000), periodEnd: new Date(Date.now() - 1000) } });
    assert.equal(await entitled(db, env, user, 'PROGRAM_ACCESS', resource), false);
    const state = await service.current(user); assert.equal(state.subscription!.status, 'EXPIRED');
    assert.equal((await call(`/membership/${subscriptionId}/reactivate`, {})).statusCode, 409);
  });
  await t.test('failed payment never grants benefits or creates receipt; can rejoin', async () => {
    const checkout = await service.subscribe(user, input());
    assert.ok(checkout.payment);
    const r = await service.settle(user, checkout.payment!.id, 'fail'); assert.equal(r.verified, false);
    assert.equal(await db.invoice.count({ where: { paymentId: checkout.payment!.id } }), 0);
    assert.equal((await service.current(user)).subscription!.status, 'PAYMENT_FAILED');
  });
  await t.test('trial eligibility is server controlled and single use', async () => {
    const trial = await service.subscribe(other, input({ trial: true }));
    assert.equal(trial.payment, null); assert.equal(await entitled(db, env, other, 'PROGRAM_ACCESS', resource), true);
    await service.cancel(other, trial.subscription.id);
    await db.subscription.update({ where: { id: trial.subscription.id }, data: { periodStart: new Date(Date.now() - 86400000), periodEnd: new Date(Date.now() - 1000) } });
    await assert.rejects(service.subscribe(other, input({ trial: true })));
    await service.current(other);
    assert.equal(await entitled(db, env, other, 'PROGRAM_ACCESS', resource), false);
  });
  await t.test('global coupon limit includes concurrent reservations', async () => {
    await db.coupon.update({ where: { id: coupon.id }, data: { usageLimit: 2 } });
    const result = await Promise.allSettled([service.subscribe(other, input({ coupon: coupon.code })), service.subscribe(users[3]!.id, input({ coupon: coupon.code }))]);
    assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  });
  await t.test('refund request records intent without claiming returned funds', async () => {
    assert.equal((await call(`/membership/payments/${paymentId}/refund-request`, {}, 1)).statusCode, 404);
    assert.equal((await call(`/membership/payments/${paymentId}/refund-request`, {})).json().data.status, 'REFUND_REQUESTED');
    assert.equal((await db.enrollmentPayment.findUniqueOrThrow({ where: { id: paymentId } })).status, 'VERIFIED');
  });
  await t.test('production entitlement rejects demo membership', async () => {
    const production = readEnvironment({ APP_ENV: 'test', PAYMENT_MODE: 'disabled' });
    assert.equal(await entitled(db, production, other, 'PROGRAM_ACCESS', resource), false);
    await assert.rejects(new MembershipService(db, production).subscribe(other, input()));
  });
  await t.test('renewal retries are idempotent, preserve agreed price and extend once', async () => {
    const owner = users[4]!.id;
    const first = await service.subscribe(owner, input()); await service.settle(owner, first.payment!.id, 'capture');
    const end = new Date(Date.now() + 86400000);
    await db.subscription.update({ where: { id: first.subscription.id }, data: { periodStart: new Date(Date.now() - 86400000), periodEnd: end } });
    await db.membershipPlan.update({ where: { id: plan.id }, data: { pricePaise: 15000 } });
    const review = await service.review(owner, plan.id, ''); assert.equal(review.renewalPricePaise, 9900);
    const body = input({ renew: true }); const renewal = await service.subscribe(owner, body);
    const replay = await service.subscribe(owner, body); assert.equal(renewal.payment!.id, replay.payment!.id);
    assert.equal(renewal.payment!.amountPaise, 9900);
    await service.settle(owner, renewal.payment!.id, 'capture'); await service.settle(owner, renewal.payment!.id, 'capture');
    const s = await db.subscription.findUniqueOrThrow({ where: { id: first.subscription.id } });
    assert.equal(s.periodEnd!.toISOString(), periodEnd(end, 'MONTH').toISOString());
    assert.equal(await db.subscriptionEvent.count({ where: { subscriptionId: s.id, kind: 'membership_renewed' } }), 1);
    await db.membershipPlan.update({ where: { id: plan.id }, data: { pricePaise: 9900 } });
  });
  await t.test('failed renewal grants only configured grace and then expires', async () => {
    const owner = users[4]!.id;
    const s = (await service.current(owner)).subscription!;
    await db.subscription.update({ where: { id: s.id }, data: { periodStart: new Date(Date.now() - 86400000), periodEnd: new Date(Date.now() + 60000) } });
    const retry = await service.subscribe(owner, input({ renew: true })); await service.settle(owner, retry.payment!.id, 'fail');
    await db.subscription.update({ where: { id: s.id }, data: { periodEnd: new Date(Date.now() - 1000) } });
    assert.equal((await service.current(owner)).subscription!.status, 'PAST_DUE');
    assert.equal(await entitled(db, env, owner, 'PROGRAM_ACCESS', resource), true);
    await db.subscription.update({ where: { id: s.id }, data: { graceEnd: new Date(Date.now() - 1000) } });
    assert.equal(await entitled(db, env, owner, 'PROGRAM_ACCESS', resource), false);
    assert.equal((await service.current(owner)).subscription!.status, 'EXPIRED');
  });
  await t.test('real program enrollment and protected lessons use membership and lose access on expiry', async () => {
    const owner = users[5]!.id;
    const category = await db.programCategory.create({ data: { id: randomUUID(), name: randomUUID(), interest: 'Test' } });
    const doctor = await db.doctor.create({ data: { name: 'DEMO guide', qualification: 'DEMO only', specialty: 'Sample', biography: 'No professional credentials', isDemo: true } });
    const program = await db.program.create({ data: { title: 'DEMO membership lesson', description: 'Testing only', audience: 'Test', outcomes: [], doctorId: doctor.id, categoryId: category.id, durationMinutes: 1, pricePaise: 5000, type: 'RECORDED', isDemo: true, published: true, membershipOnly: true,
      modules: { create: { title: 'Test', position: 1, lessons: { create: { title: 'Protected', description: 'Enrolled content', position: 1, durationSeconds: 20, keyPoints: [], supportingMaterial: 'Protected' } } } } }, include: { modules: { include: { lessons: true } } } });
    try {
      const programs = new ProgramService(db, env); const lesson = program.modules[0]!.lessons[0]!.id;
      await assert.rejects(programs.enroll(owner, program.id));
      const sub = await service.subscribe(owner, input()); await service.settle(owner, sub.payment!.id, 'capture');
      await db.subscription.update({ where: { id: sub.subscription.id }, data: { benefits: [{ key: 'PROGRAM_ACCESS', label: 'Selected demo', resourceIds: [program.id], value: 0 }, { key: 'MEMBER_PROGRAMS', label: 'Demo member program', resourceIds: [program.id], value: 0 }] } });
      await programs.enroll(owner, program.id);
      assert.equal((await programs.lesson(owner, program.id, lesson)).description, 'Enrolled content');
      assert.equal(await db.enrollmentPayment.count({ where: { userId: owner, programId: program.id } }), 0);
      await db.subscription.update({ where: { id: sub.subscription.id }, data: { periodStart: new Date(Date.now() - 86400000), periodEnd: new Date(Date.now() - 1000) } });
      await assert.rejects(programs.lesson(owner, program.id, lesson));
      assert.equal((await programs.detail(owner, program.id)).membershipRequired, true);
      await db.program.update({ where: { id: program.id }, data: { membershipOnly: false } });
      assert.equal((await programs.detail(owner, program.id)).enrolled, false);
      const purchase = await programs.payment(owner, program.id);
      await programs.settleDevelopment(owner, purchase.id, 'capture');
      assert.equal((await programs.lesson(owner, program.id, lesson)).description, 'Enrolled content');
    } finally {
      await db.enrollmentPayment.deleteMany({ where: { programId: program.id } });
      await db.programEnrollment.deleteMany({ where: { programId: program.id } });
      await db.program.delete({ where: { id: program.id } }); await db.doctor.delete({ where: { id: doctor.id } }); await db.programCategory.delete({ where: { id: category.id } });
    }
  });
  await t.test('member wellness pricing is server calculated; expiry removes product access', async () => {
    const owner = users[5]!.id;
    const sub = await service.subscribe(owner, input()); await service.settle(owner, sub.payment!.id, 'capture');
    const category = await db.wellnessCategory.create({ data: { id: randomUUID(), name: randomUUID() } });
    const p = await db.wellnessProduct.create({ data: { name: 'DEMO bottle', slug: randomUUID(), sku: randomUUID(), shortDescription: 'Demo', description: 'Demo', categoryId: category.id, pricePaise: 10000, brand: 'DEMO', manufacturer: 'DEMO', ingredients: 'Demo materials', usage: 'Demo', warnings: 'Demo', storage: 'Demo', quantityLabel: '1', returnPolicy: 'Demo', isDemo: true, status: 'ACTIVE', contentApproved: true, shippingEligible: true, requiresEligibility: false, membershipOnly: true, stockQuantity: 5 } });
    try {
      const commerce = new CommerceService(db, env);
      await assert.rejects(commerce.setCart(other, p.id, 1));
      await db.subscription.update({ where: { id: sub.subscription.id }, data: { benefits: [{ key: 'MEMBER_PRODUCTS', label: 'Selected demo product', resourceIds: [p.id], value: 0 }, { key: 'WELLNESS_MEMBER_PRICING', label: '10% demo saving', resourceIds: [p.id], value: 10 }] } });
      assert.equal((await commerce.product(p.id, owner)).memberPricePaise, 9000);
      const cart = await commerce.setCart(owner, p.id, 1); assert.equal(cart.subtotalPaise, 9000); assert.equal(cart.canCheckout, true);
      assert.equal(cart.items[0]!.priceChanged, false);
      await db.subscription.update({ where: { id: sub.subscription.id }, data: { periodStart: new Date(Date.now() - 86400000), periodEnd: new Date(Date.now() - 1000) } });
      const expired = await commerce.cart(owner); assert.equal(expired.canCheckout, false); assert.equal(expired.subtotalPaise, 10000);
    } finally { await db.cartItem.deleteMany({ where: { productId: p.id } }); await db.wellnessProduct.delete({ where: { id: p.id } }); await db.wellnessCategory.delete({ where: { id: category.id } }); }
  });
  await t.test('consultation reservation uses the configured member fee', async () => {
    const owner = users[5]!.id; const sub = await service.subscribe(owner, input()); await service.settle(owner, sub.payment!.id, 'capture');
    const doctor = await db.doctor.create({ data: { name: 'DEMO consultation guide', qualification: 'DEMO only', specialty: 'Sample', biography: 'No credentials claimed', isDemo: true, verificationStatus: 'VERIFIED', acceptingAppointments: true, feePaise: 10000,
      availability: { create: Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, startMinute: 540, endMinute: 1080 })) } } });
    try {
      await db.subscription.update({ where: { id: sub.subscription.id }, data: { benefits: [{ key: 'CONSULTATION_DISCOUNT', label: '10% demo consultation', resourceIds: [doctor.id], value: 10 }] } });
      const consultations = new ConsultationService(db, env);
      const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const slots = await consultations.slots(doctor.id, date);
      const booking = await consultations.book(owner, doctor.id, date, slots.slots[0]!.startsAt.toISOString());
      assert.equal(booking.feePaise, 9000);
    } finally { await db.consultation.deleteMany({ where: { doctorId: doctor.id } }); await db.doctor.delete({ where: { id: doctor.id } }); }
  });
});
