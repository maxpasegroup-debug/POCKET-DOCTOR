import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { buildApp } from '../src/app.js';
import { readEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/database/database.js';
import { hashToken } from '../src/modules/auth/identity-service.js';
import { receiptMatches } from '../src/modules/programs/payment-provider.js';

test('payment receipt must match captured server order, amount and currency', () => {
  const order = { id: 'order', amountPaise: 49900, currency: 'INR' };
  const receipt = { orderId: 'order', amountPaise: 49900, currency: 'INR', captured: true, reference: 'provider-reference' };
  assert.equal(receiptMatches(order, receipt), true);
  for (const changed of [{ captured: false }, { orderId: 'other' }, { amountPaise: 1 }, { currency: 'USD' }, { reference: '' }]) {
    assert.equal(receiptMatches(order, { ...receipt, ...changed }), false);
  }
});
test('development payments and demo catalog fail closed in deployments', () => {
  for (const field of ['PAYMENT_MODE', 'DEMO_PROGRAMS']) assert.throws(() => readEnvironment({ APP_ENV: 'production', DATABASE_URL: 'postgresql://localhost/test', [field]: field === 'PAYMENT_MODE' ? 'development' : 'true' }));
});

test('program enrollment, entitlement and learning lifecycle on PostgreSQL', { skip: process.env.AUTH_INTEGRATION !== 'true' || !process.env.DATABASE_URL }, async t => {
  const database = createDatabase(process.env.DATABASE_URL!);
  const db = database.client!;
  const env = readEnvironment({ APP_ENV: 'test', PAYMENT_MODE: 'development', DEMO_PROGRAMS: 'true' });
  const app = await buildApp(env, database);
  const user = await db.user.create({ data: { interests: ['Weight Management'], roles: { create: { role: 'USER' } } } });
  const other = await db.user.create({ data: {} });
  const token = randomBytes(32).toString('base64url'), otherToken = randomBytes(32).toString('base64url');
  await db.session.createMany({ data: [{ userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 600000) }, { userId: other.id, tokenHash: hashToken(otherToken), expiresAt: new Date(Date.now() + 600000) }] });
  const category = await db.programCategory.create({ data: { id: randomUUID(), name: `Weight ${randomUUID()}`, interest: 'Weight Management' } });
  const doctor = await db.doctor.create({ data: { name: 'DEMO Test guide', qualification: 'DEMO, no credentials', specialty: 'Sample', biography: 'Not a real professional', isDemo: true } });
  const create = (pricePaise: number, type: 'LIVE' | 'RECORDED' = 'RECORDED') => db.program.create({ data: { title: `DEMO ${pricePaise}`, description: 'Searchable sample education', audience: 'Test only', outcomes: ['Testing'], doctorId: doctor.id, categoryId: category.id, durationMinutes: 10, pricePaise, type, isDemo: true, published: true, featured: true,
    ...(type === 'RECORDED' ? { modules: { create: { title: 'First steps', position: 1, lessons: { create: [
      { title: 'First lesson', description: 'Protected description', position: 1, durationSeconds: 30, keyPoints: ['Protected'], supportingMaterial: 'Protected material', mediaRef: 'demo:bee' },
      { title: 'Next lesson', description: 'Protected', position: 2, durationSeconds: 30, keyPoints: [], supportingMaterial: 'Protected' },
    ] } } } } : { liveSessions: { create: { title: 'DEMO session', startsAt: new Date(Date.now() + 3600000), durationMinutes: 30, information: 'Enrolled session information', providerRef: 'never-public' } } }),
  }, include: { modules: { include: { lessons: { orderBy: { position: 'asc' } } } } } });
  const free = await create(0), paid = await create(49900), live = await create(0, 'LIVE');
  const lesson = free.modules[0]!.lessons[0]!, next = free.modules[0]!.lessons[1]!, paidLesson = paid.modules[0]!.lessons[0]!;
  let requestCount = 0;
  const call = (path: string, body?: object, bearer: string | null = token) => app.inject({ method: body ? 'POST' : 'GET', url: `/api/v1${path}`, remoteAddress: `127.0.2.${++requestCount}`, ...(body ? { payload: body } : {}), ...(bearer ? { headers: { authorization: `Bearer ${bearer}` } } : {}) });
  t.after(async () => {
    await db.enrollmentPayment.deleteMany({ where: { userId: { in: [user.id, other.id] } } });
    await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    await db.program.deleteMany({ where: { doctorId: doctor.id } });
    await db.doctor.delete({ where: { id: doctor.id } });
    await db.programCategory.delete({ where: { id: category.id } });
    await app.close();
  });
  await t.test('discovery, search, categories and safe detail DTO', async () => {
    assert.equal((await call('/programs', undefined, null)).statusCode, 401);
    const result = await call(`/programs?category=${category.id}&q=Searchable&type=RECORDED&price=free&duration=short`);
    assert.equal(result.statusCode, 200); assert.equal(result.json().data.programs.length, 1);
    assert.equal((await call('/programs/categories')).statusCode, 200);
    assert.equal((await call('/programs/featured')).statusCode, 200);
    assert.ok((await call('/programs?recommended=true')).json().data.programs.some((p: { id: string }) => p.id === free.id));
    const detail = (await call(`/programs/${paid.id}`)).json().data.program;
    assert.equal(detail.doctor.isDemo, true); assert.equal(detail.doctor.verified, false);
    assert.ok(!JSON.stringify(detail).includes('mediaRef')); assert.ok(!JSON.stringify(detail).includes('Protected material'));
    assert.equal((await call('/programs/not-a-uuid')).statusCode, 400);
    assert.equal((await call(`/programs/${randomUUID()}`)).statusCode, 404);
    assert.equal((await call('/programs?page=-1')).statusCode, 400);
  });
  await t.test('free enrollment is idempotent under concurrency and cannot target another user', async () => {
    assert.equal((await call(`/programs/${free.id}/enroll`, { userId: other.id })).statusCode, 400);
    const responses = await Promise.all([call(`/programs/${free.id}/enroll`, {}), call(`/programs/${free.id}/enroll`, {})]);
    assert.deepEqual(responses.map(r => r.statusCode), [200, 200]);
    assert.equal(await db.programEnrollment.count({ where: { userId: user.id, programId: free.id } }), 1);
    assert.equal((await call(`/me/programs/${free.id}/lessons/${lesson.id}`)).statusCode, 200);
    assert.equal((await call(`/me/programs/${free.id}/lessons/${lesson.id}`, undefined, otherToken)).statusCode, 403);
    assert.equal((await call(`/me/programs/${free.id}/lessons/${paidLesson.id}`)).statusCode, 404);
  });
  await t.test('paid access requires verified payment, simulator failure does not enroll', async () => {
    // Even an incorrectly provisioned enrollment cannot bypass the payment check.
    await db.programEnrollment.create({ data: { userId: other.id, programId: paid.id } });
    assert.equal((await call(`/me/programs/${paid.id}/lessons/${paidLesson.id}`, undefined, otherToken)).statusCode, 403);
    assert.equal((await call(`/programs/${paid.id}/enroll`, {})).statusCode, 402);
    assert.equal((await call(`/me/programs/${paid.id}/lessons/${paidLesson.id}`)).statusCode, 403);
    assert.equal((await call(`/programs/${paid.id}/payment`, { amountPaise: 1 })).statusCode, 400);
    const payment = (await call(`/programs/${paid.id}/payment`, {})).json().data.payment;
    assert.equal(payment.amountPaise, 49900);
    assert.equal((await call(`/program-payments/${payment.id}/development-settle`, { outcome: 'capture', verified: true })).statusCode, 400);
    assert.equal((await call(`/program-payments/${payment.id}/development-settle`, { outcome: 'capture' }, otherToken)).statusCode, 404);
    assert.equal((await call(`/program-payments/${payment.id}/development-settle`, { outcome: 'fail' })).json().data.verified, false);
    assert.equal((await call(`/me/programs/${paid.id}/lessons/${paidLesson.id}`)).statusCode, 403);
    const retry = (await call(`/programs/${paid.id}/payment`, {})).json().data.payment;
    const captured = await Promise.all([call(`/program-payments/${retry.id}/development-settle`, { outcome: 'capture' }), call(`/program-payments/${retry.id}/development-settle`, { outcome: 'capture' })]);
    assert.ok(captured.every(r => r.json().data.verified === true));
    assert.equal(await db.programEnrollment.count({ where: { userId: user.id, programId: paid.id } }), 1);
    assert.equal((await call(`/me/programs/${paid.id}/lessons/${paidLesson.id}`)).statusCode, 200);
  });
  await t.test('progress is scoped, persisted, monotonic completion and final program completion', async () => {
    const path = `/me/programs/${free.id}/lessons/${lesson.id}/progress`;
    assert.equal((await call(path, { positionSeconds: 10, completed: false }, otherToken)).statusCode, 403);
    assert.equal((await call(path, { positionSeconds: 31, completed: true })).statusCode, 400);
    assert.equal((await call(path, { positionSeconds: 10, completed: false })).statusCode, 200);
    assert.equal((await call(`/me/programs/${free.id}/lessons/${lesson.id}`)).json().data.lesson.positionSeconds, 10);
    assert.equal((await call(path, { positionSeconds: 30, completed: true })).json().data.enrollment.percentage, 50);
    await call(path, { positionSeconds: 0, completed: false });
    assert.equal((await call(`/me/programs/${free.id}/progress`)).json().data.enrollment.percentage, 50);
    const final = await call(`/me/programs/${free.id}/lessons/${next.id}/progress`, { positionSeconds: 0, completed: true });
    assert.equal(final.json().data.enrollment.status, 'COMPLETED'); assert.ok(final.json().data.enrollment.completedAt);
    assert.equal((await call('/me/programs')).json().data.programs.length, 2);
  });
  await t.test('live schedule exposes no provider access; enrollment provides information', async () => {
    const before = (await call(`/programs/${live.id}`)).json().data.program;
    assert.equal(before.liveSessions[0].status, 'UPCOMING'); assert.equal(before.liveSessions[0].information, null);
    assert.ok(!JSON.stringify(before).includes('never-public'));
    await call(`/programs/${live.id}/enroll`, {});
    assert.equal((await call(`/me/programs/${live.id}`)).json().data.program.liveSessions[0].information, 'Enrolled session information');
  });
  await t.test('demo data hidden when disabled, unverified real professionals cannot publish', async () => {
    const hidden = await buildApp(readEnvironment({ APP_ENV: 'test' }), { client: db, ping: async () => {}, close: async () => {} });
    assert.equal((await hidden.inject({ url: `/api/v1/programs/${free.id}`, headers: { authorization: `Bearer ${token}` } })).statusCode, 404);
    await db.program.update({ where: { id: free.id }, data: { isDemo: false } });
    assert.equal((await call(`/programs/${free.id}`)).statusCode, 404);
    await hidden.close();
  });
});
