import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { readEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/database/database.js';
import { hashToken, IdentityService } from '../src/modules/auth/identity-service.js';
import { totp } from '../src/modules/admin/security.js';
import { doctorInput, programInput } from '../src/modules/admin/contracts.js';
import { collectNotifications } from '../src/modules/notifications/service.js';

test('RFC 6238 vector and administrative input validation', () => {
  // Public RFC test vector, not an account credential.
  assert.equal(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1n, 8), '94287082');
  assert.equal(doctorInput.safeParse({ verificationStatus: 'VERIFIED' }).success, false);
  assert.equal(programInput.safeParse({ publicationStatus: 'PUBLISHED', pricePaise: -1 }).success, false);
  assert.throws(() => readEnvironment({ APP_ENV: 'production', ADMIN_SECURITY_MODE: 'development' }), /ADMIN_SECURITY_MODE/);
  assert.throws(() => readEnvironment({ ADMIN_SECURITY_MODE: 'totp', ADMIN_TOTP_KEYS: '{}' }), /ADMIN_TOTP_KEYS/);
  assert.throws(() => readEnvironment({ TRUSTED_PROXY_CIDRS: '0.0.0.0/0' }), /TRUSTED_PROXY_CIDRS/);
  assert.throws(() => readEnvironment({ TRUSTED_PROXY_CIDRS: 'true' }), /TRUSTED_PROXY_CIDRS/);
});

test('Phase 7 operations, privacy and persistent MFA', { skip: process.env.AUTH_INTEGRATION !== 'true' || !process.env.DATABASE_URL }, async t => {
  const database = createDatabase(process.env.DATABASE_URL!), db = database.client!;
  const users = await Promise.all(['ADMIN', 'USER', 'USER', 'DOCTOR'].map(role => db.user.create({ data: { fullName: 'DEMO Phase 7 test', roles: { create: { role: role as 'ADMIN' | 'USER' | 'DOCTOR' } } } })));
  const tokens = users.map(() => randomBytes(32).toString('base64url'));
  const sessions = await Promise.all(users.map((u, i) => db.session.create({ data: { userId: u.id, tokenHash: hashToken(tokens[i]!), expiresAt: new Date(Date.now() + 3600000) } })));
  const mfaKey = randomBytes(20).toString('hex').toUpperCase().replace(/[0189]/g, 'A');
  // Base32 key generated per run; no persistent shared test administrator secret.
  const env = readEnvironment({ APP_ENV: 'test', ADMIN_SECURITY_MODE: 'totp', ADMIN_TOTP_KEYS: JSON.stringify({ [users[0]!.id]: mfaKey }), DEMO_PROGRAMS: 'true', PAYMENT_MODE: 'development' });
  const app = await buildApp(env, database); t.after(() => app.close());
  let counter = 0;
  const call = (path: string, actor = 0, body?: object, method?: 'GET' | 'POST' | 'PATCH') => app.inject({ method: method ?? (body ? 'POST' : 'GET'), url: `/api/v1${path}`, remoteAddress: `127.7.0.${++counter}`,
    headers: { authorization: `Bearer ${tokens[actor]}` }, ...(body ? { payload: body } : {}) });
  await t.test('successful administrator login records durable minimal audit evidence', async () => {
    const phone = `+9199${Date.now().toString().slice(-8)}`;
    await db.user.update({ where: { id: users[0]!.id }, data: { phone } });
    const identity = new IdentityService(db, { ...env, OTP_MODE: 'development', SESSION_SECRET: randomBytes(32).toString('hex') });
    const challenge = await identity.requestOtp(phone), correlation = randomUUID();
    const signedIn = await identity.verifyOtp(challenge.challengeId, challenge.developmentCode, correlation);
    const principal = await identity.verify(signedIn.token); assert.ok(principal);
    const events = await db.adminAuditEvent.findMany({ where: { actorId: users[0]!.id, action: 'ADMIN_LOGIN', requestId: correlation } });
    assert.equal(events.length, 1); assert.equal(events[0]!.resourceId, principal.sessionId);
    assert.ok(!JSON.stringify(events).includes(phone)); assert.ok(!JSON.stringify(events).includes(signedIn.token));
    await identity.logout(principal);
  });
  await t.test('admin requires a role and second factor across old and new endpoints', async () => {
    assert.equal((await call('/admin/operations/dashboard', 1)).statusCode, 403);
    assert.equal((await call('/admin/revenue')).json().error.code, 'ADMIN_STEP_UP_REQUIRED');
    const code = totp(mfaKey, BigInt(Math.floor(Date.now() / 30000)));
    assert.equal((await call('/admin/session/elevate', 0, { code })).statusCode, 200);
    assert.equal((await call('/admin/session/elevate', 0, { code })).statusCode, 403);
    assert.equal((await call('/admin/operations/dashboard')).statusCode, 200);
  });
  await t.test('admin lists are bounded and omit medical records and credentials', async () => {
    for (const domain of ['users', 'doctors', 'programs', 'products', 'orders', 'appointments', 'memberships', 'payments', 'audit', 'ai', 'notifications']) {
      const result = await call(`/admin/operations/${domain}`); assert.equal(result.statusCode, 200, domain);
      assert.ok(result.json().data.items.length <= 20);
      for (const forbidden of ['privateNote', 'codeHash', 'tokenHash', 'requestHash', 'prompt', 'addressSnapshot']) assert.ok(!result.body.includes(`"${forbidden}"`), domain);
    }
    assert.equal((await call('/admin/operations/users?page=-1')).statusCode, 400);
    assert.equal((await call('/admin/operations/users/not-an-id')).statusCode, 400);
  });
  await t.test('account suspension revokes access, protects administrators, and audits changes', async () => {
    const id = users[1]!.id;
    assert.equal((await call(`/admin/operations/users/${id}/status`, 0, { status: 'SUSPENDED', reason: 'SECURITY_REVIEW' })).statusCode, 200);
    assert.equal((await call('/users/me', 1)).statusCode, 401);
    assert.equal(await new IdentityService(db, env).verify(tokens[1]!), null);
    assert.equal((await call(`/admin/operations/users/${users[0]!.id}/status`, 0, { status: 'SUSPENDED', reason: 'SECURITY_REVIEW' })).statusCode, 403);
    assert.ok(await db.adminAuditEvent.count({ where: { resourceId: id, action: 'ACCOUNT_SUSPENDED_SECURITY_REVIEW' } }));
    assert.equal((await call(`/admin/operations/users/${id}/status`, 0, { status: 'ACTIVE', reason: 'SUPPORT_REQUEST' })).statusCode, 200);
    assert.equal((await call('/users/me', 1)).statusCode, 401); // Old token stays revoked.
  });
  await t.test('audit events cannot be altered or deleted', async () => {
    const row = await db.adminAuditEvent.findFirstOrThrow({ where: { actorId: users[0]!.id } });
    await assert.rejects(db.adminAuditEvent.update({ where: { id: row.id }, data: { result: 'ALTERED' } }));
    await assert.rejects(db.adminAuditEvent.delete({ where: { id: row.id } }));
  });
  await t.test('consent is versioned, separate and does not invent legal approval', async () => {
    assert.equal((await call('/me/consents', 2, { type: 'TERMS', version: '1', granted: true })).statusCode, 409);
    assert.equal((await call('/me/consents', 2, { type: 'MARKETING', version: '1', granted: true })).statusCode, 200);
    const prefs = await db.user.findUniqueOrThrow({ where: { id: users[2]!.id } }); assert.equal(prefs.notifications, false);
    assert.equal((await call('/me/consents', 2, { type: 'MARKETING', version: '1', granted: false })).statusCode, 200);
    assert.equal((await call('/me/privacy', 2)).json().data.consents.find((v: { type: string }) => v.type === 'MARKETING').granted, false);
    const row = await db.consentRecord.findFirstOrThrow({ where: { userId: users[2]!.id } });
    await assert.rejects(db.consentRecord.delete({ where: { id: row.id } }));
  });
  await t.test('admin curriculum changes are draft-only and archiving preserves enrollment', async () => {
    const categoryId = `test-${randomUUID()}`;
    assert.equal((await call('/admin/operations/categories', 0, { id: categoryId, name: categoryId, interest: null, position: 1 })).statusCode, 200);
    const doctor = await db.doctor.create({ data: { name: 'DEMO curriculum test', qualification: 'DEMO — no credentials', specialty: 'DEMO', biography: 'Synthetic test profile', isDemo: true } });
    const input = { title: 'DEMO admin curriculum', description: 'Educational test content', audience: 'Synthetic test', outcomes: [], categoryId, doctorId: doctor.id, type: 'RECORDED', durationMinutes: 1,
      pricePaise: 0, level: 'Beginner', membershipOnly: false, featured: false, publicationStatus: 'DRAFT', coverUrl: null };
    const created = await call('/admin/operations/programs', 0, { ...input, isDemo: true }); assert.equal(created.statusCode, 200);
    const id = created.json().data.item.id;
    const module = await call(`/admin/operations/programs/${id}/modules`, 0, { title: 'DEMO module', position: 1 }); assert.equal(module.statusCode, 200);
    assert.equal((await call(`/admin/operations/programs/${id}`, 0, { ...input, publicationStatus: 'PUBLISHED' }, 'PATCH')).statusCode, 200);
    assert.equal((await call(`/admin/operations/programs/${id}/modules/${module.json().data.item.id}`, 0, { title: 'Changed', position: 1 }, 'PATCH')).statusCode, 409);
    assert.equal((await call(`/programs/${id}/enroll`, 2, {})).statusCode, 200);
    assert.equal((await call(`/admin/operations/programs/${id}`, 0, { ...input, publicationStatus: 'ARCHIVED' }, 'PATCH')).statusCode, 200);
    assert.equal(await db.programEnrollment.count({ where: { programId: id, userId: users[2]!.id } }), 1);
    const history = await call(`/admin/operations/users/${users[2]!.id}/activity?kind=programs`);
    assert.equal(history.statusCode, 200); assert.ok(history.body.includes('DEMO admin curriculum'));
  });
  await t.test('export is owner-bound and never includes private doctor notes or sessions', async () => {
    const conversation = await db.aIConversation.create({ data: { userId: users[2]!.id } });
    const own = await call('/me/export?category=profile', 2); assert.equal(own.statusCode, 200);
    assert.ok(!own.body.includes('tokenHash'));
    assert.equal((await call(`/me/export?category=messages&conversationId=${conversation.id}`, 0)).statusCode, 403);
    assert.equal((await call(`/me/export?category=messages&conversationId=${randomUUID()}`, 2)).statusCode, 404);
    assert.equal((await call('/me/export?category=private-notes', 2)).statusCode, 400);
    for (const category of ['messages', 'goals', 'checkins', 'reminders', 'addresses']) {
      const exported = await call(`/me/export?category=${category}`, 2);
      assert.equal(exported.statusCode, 200);
      assert.deepEqual(exported.json().data.items, []);
    }
  });
  await t.test('notification ownership and collection are idempotent', async () => {
    const n = await db.notification.create({ data: { userId: users[2]!.id, sourceKey: randomUUID(), kind: 'account', route: '/profile' } });
    assert.equal((await call(`/me/notifications/${n.id}/read`, 0, {})).statusCode, 404);
    assert.equal((await call(`/me/notifications/${n.id}/read`, 2, {})).statusCode, 200);
    await collectNotifications(db); const count = await db.notification.count({ where: { userId: users[2]!.id } }); await collectNotifications(db); assert.equal(await db.notification.count({ where: { userId: users[2]!.id } }), count);
  });
  await t.test('deletion ends access while retaining records for review', async () => {
    assert.equal((await call('/me/privacy/deletion', 2, { confirmation: 'yes' })).statusCode, 400);
    const result = await call('/me/privacy/deletion', 2, { confirmation: 'DELETE MY ACCOUNT' }); assert.equal(result.statusCode, 200);
    assert.equal(result.json().data.recordsDeleted, false);
    assert.equal((await call('/users/me', 2)).statusCode, 401);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: users[2]!.id } })).accountStatus, 'DELETION_REQUESTED');
    assert.ok(await db.consentRecord.count({ where: { userId: users[2]!.id } }));
  });
  await t.test('expired elevated sessions and per-account failed attempts fail closed', async () => {
    await db.adminElevation.update({ where: { sessionId: sessions[0]!.id }, data: { expiresAt: new Date(0) } });
    assert.equal((await call('/admin/operations/dashboard')).statusCode, 403);
    for (let i = 0; i < 6; i++) assert.equal((await call('/admin/session/elevate', 0, { code: 'not-a-code' })).statusCode, 400);
    // A consumed valid counter is also a failed attempt; changing IP cannot reset the limit.
    const usedCounter = (await db.adminMfaCounter.findUniqueOrThrow({ where: { userId: users[0]!.id } })).counter;
    const code = totp(mfaKey, usedCounter);
    for (let i = 0; i < 6; i++) assert.equal((await call('/admin/session/elevate', 0, { code })).statusCode, 403);
    assert.equal((await db.adminMfaCounter.findUniqueOrThrow({ where: { userId: users[0]!.id } })).failedAttempts, 5);
  });
  // Append-only synthetic audit/consent evidence is intentionally retained in the
  // isolated test DB. Never disable audit protections to clean up fixtures.
});
