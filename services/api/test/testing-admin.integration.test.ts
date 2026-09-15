import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { readEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/database/database.js';
import { buildApp } from '../src/app.js';
import { IdentityService } from '../src/modules/auth/identity-service.js';
import { provisionTestingAdmin } from '../src/modules/admin/provision-testing-admin.js';
import { totp } from '../src/modules/admin/security.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const key = () => Array.from(randomBytes(32), b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[b % 32]).join('');

test('staging Admin preview requires TOTP and remains forbidden in production', () => {
  const base = { APP_ENV: 'staging', NODE_ENV: 'production', OTP_MODE: 'testing', DATABASE_URL: 'postgresql://localhost/test',
    SESSION_SECRET: randomBytes(32).toString('hex'), ADMIN_SECURITY_MODE: 'totp', ADMIN_TOTP_KEYS: JSON.stringify({ [randomUUID()]: key() }),
    OTP_TEST_ACCOUNTS: JSON.stringify({ [digest(randomUUID())]: 'ADMIN' }) };
  assert.equal(readEnvironment(base).ADMIN_SECURITY_MODE, 'totp');
  for (const override of [{ APP_ENV: 'production' }, { ADMIN_SECURITY_MODE: 'disabled' }, { ADMIN_SECURITY_MODE: 'development' },
    { ADMIN_TOTP_KEYS: '{}' }, { OTP_MODE: 'provider' }]) assert.throws(() => readEnvironment({ ...base, ...override }));
});

test('staging Admin OTP, operator provisioning and mandatory MFA on PostgreSQL', {
  skip: process.env.AUTH_INTEGRATION !== 'true' || !process.env.DATABASE_URL,
}, async t => {
  const database = createDatabase(process.env.DATABASE_URL!), db = database.client!;
  const adminId = randomUUID(), adminKey = key(), phones: string[] = [], ids: string[] = [adminId];
  const registry: Record<string, string> = {}, keys: Record<string, string> = { [adminId]: adminKey };
  const env = readEnvironment({ APP_ENV: 'staging', NODE_ENV: 'production', OTP_MODE: 'testing', LOG_LEVEL: 'silent',
    DATABASE_URL: process.env.DATABASE_URL, SESSION_SECRET: randomBytes(32).toString('hex'),
    ADMIN_SECURITY_MODE: 'totp', ADMIN_TOTP_KEYS: JSON.stringify(keys) });
  const app = await buildApp(env, database);
  const sync = () => { env.OTP_TEST_ACCOUNTS = JSON.stringify(registry); env.ADMIN_TOTP_KEYS = JSON.stringify(keys); };
  let seq = 0;
  const call = (path: string, body?: object, token?: string) => app.inject({ method: body ? 'POST' : 'GET', url: '/api/v1' + path,
    remoteAddress: `127.72.0.${++seq}`, ...(body ? { payload: body } : {}), headers: token ? { authorization: 'Bearer ' + token } : {} });
  const fresh = async (kind?: string) => {
    let phone: string;
    do { phone = '+919' + randomInt(1e9).toString().padStart(9, '0'); } while (phones.includes(phone) || await db.user.findUnique({ where: { phone } }));
    phones.push(phone); if (kind) registry[digest(phone)] = kind; sync(); return phone;
  };
  const request = (phone: string) => call('/auth/otp/request', { phone, context: 'ADMIN' });
  const verify = (challenge: { challengeId: string; developmentCode: string }, context: string = 'ADMIN') => call('/auth/otp/verify', {
    challengeId: challenge.challengeId, code: challenge.developmentCode, context,
  });
  const cool = (phone: string) => db.otpChallenge.updateMany({ where: { phone }, data: { requestedAt: new Date(0), windowStartedAt: new Date(0) } });
  t.after(async () => {
    await db.adminElevation.deleteMany({ where: { userId: { in: ids } } });
    await db.adminMfaCounter.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.otpChallenge.deleteMany({ where: { phone: { in: phones } } });
    await app.close();
  });
  const phone = await fresh('ADMIN');
  await t.test('listing a new number never creates Admin or Patient through public login', async () => {
    assert.equal((await request(phone)).statusCode, 403);
    assert.equal(await db.user.count({ where: { phone } }), 0);
    assert.equal(await db.otpChallenge.count({ where: { phone } }), 0);
  });
  await t.test('operator provisioning is explicit, idempotent, and rejects production', async () => {
    await assert.rejects(provisionTestingAdmin(db, { ...env, APP_ENV: 'production' }, { phone, userId: adminId }));
    assert.equal(await provisionTestingAdmin(db, env, { phone, userId: adminId }), 'created');
    assert.equal(await provisionTestingAdmin(db, env, { phone, userId: adminId }), 'existing');
    const user = await db.user.findUniqueOrThrow({ where: { id: adminId }, include: { roles: true } });
    assert.deepEqual(user.roles.map(r => r.role), ['ADMIN']);
    assert.equal(await db.user.count({ where: { phone } }), 1);
  });
  let token = '';
  await t.test('OTP preview creates only an unelevated session and prevents context substitution and replay', async () => {
    const response = await request(phone); assert.equal(response.statusCode, 200);
    const challenge = response.json().data; assert.equal(challenge.delivery, 'testing');
    assert.equal((await verify(challenge, 'DOCTOR')).statusCode, 400);
    const login = await verify(challenge); assert.equal(login.statusCode, 200); token = login.json().data.token;
    assert.deepEqual(login.json().data.user.roles, ['ADMIN']);
    assert.equal((await verify(challenge)).statusCode, 400);
    assert.equal((await call('/admin/operations/dashboard', undefined, token)).json().error.code, 'ADMIN_STEP_UP_REQUIRED');
    assert.equal((await call('/admin/revenue', undefined, token)).json().error.code, 'ADMIN_STEP_UP_REQUIRED');
    assert.equal((await call('/auth/session', undefined, token)).statusCode, 200);
  });
  await t.test('authenticator is required, replay is rejected, and authorized Admin reaches dashboard', async () => {
    assert.equal((await call('/admin/session/elevate', {}, token)).statusCode, 403);
    const code = totp(adminKey, BigInt(Math.floor(Date.now() / 30000)));
    assert.equal((await call('/admin/session/elevate', { code }, token)).statusCode, 200);
    assert.equal((await call('/admin/session/elevate', { code }, token)).statusCode, 403);
    assert.equal((await call('/admin/operations/dashboard', undefined, token)).statusCode, 200);
  });
  await t.test('Admin cannot use Patient or Doctor test context or Doctor registration', async () => {
    for (const context of [undefined, 'DOCTOR']) {
      const r = await call('/auth/otp/request', { phone, ...(context ? { context } : {}) });
      assert.equal(r.statusCode, 403); assert.equal(r.json().error.code, 'TEST_LOGIN_NOT_ALLOWED');
    }
    assert.equal((await call('/doctor/registration/otp/request', { phone })).statusCode, 403);
    assert.equal((await call('/doctor/appointments', undefined, token)).statusCode, 403);
  });
  await t.test('Patient, Doctor and unknown identities cannot select Admin or be promoted by operator utility', async () => {
    for (const role of ['USER', 'DOCTOR'] as const) {
      const p = await fresh('ADMIN'), id = randomUUID(); ids.push(id); keys[id] = key(); sync();
      await db.user.create({ data: { id, phone: p, roles: { create: { role } } } });
      assert.equal((await request(p)).statusCode, 403);
      await assert.rejects(provisionTestingAdmin(db, env, { phone: p, userId: id }), /refusing to promote/);
      assert.deepEqual((await db.userRole.findMany({ where: { userId: id } })).map(r => r.role), [role]);
    }
    assert.equal((await request(await fresh())).statusCode, 403);
    const spoofedPhone = await fresh();
    assert.equal((await call('/auth/otp/request', { phone: spoofedPhone, context: 'ADMIN', role: 'ADMIN' })).statusCode, 403);
    assert.equal(await db.user.count({ where: { phone: spoofedPhone } }), 0);
  });
  await t.test('missing authenticator, suspension and registry revocation invalidate existing sessions', async () => {
    delete keys[adminId]; sync();
    assert.equal((await call('/auth/session', undefined, token)).statusCode, 401);
    assert.equal((await request(phone)).statusCode, 403);
    keys[adminId] = adminKey; sync();
    await db.user.update({ where: { id: adminId }, data: { accountStatus: 'SUSPENDED' } });
    assert.equal((await call('/auth/session', undefined, token)).statusCode, 401);
    await assert.rejects(provisionTestingAdmin(db, env, { phone, userId: adminId }));
    await db.user.update({ where: { id: adminId }, data: { accountStatus: 'ACTIVE' } });
    delete registry[digest(phone)]; sync();
    assert.equal((await call('/auth/session', undefined, token)).statusCode, 401);
    registry[digest(phone)] = 'ADMIN'; sync();
  });
  await t.test('role changes after requesting OTP cannot grant a session', async () => {
    await cool(phone); const challenge = (await request(phone)).json().data;
    await db.userRole.deleteMany({ where: { userId: adminId } });
    assert.equal((await verify(challenge)).statusCode, 400);
    assert.equal((await call('/auth/session', undefined, token)).statusCode, 401);
    await db.userRole.create({ data: { userId: adminId, role: 'ADMIN' } });
  });
  await t.test('logout, session expiry and switching away from testing reject the preview session', async () => {
    const providerIdentity = new IdentityService(db, { ...env, OTP_MODE: 'provider' });
    assert.equal(await providerIdentity.verify(token), null);
    assert.equal((await call('/auth/logout', {}, token)).statusCode, 200);
    assert.equal((await call('/auth/session', undefined, token)).statusCode, 401);
    await cool(phone); const login = await verify((await request(phone)).json().data); assert.equal(login.statusCode, 200);
    await db.session.updateMany({ where: { userId: adminId }, data: { expiresAt: new Date(0) } });
    assert.equal((await call('/auth/session', undefined, login.json().data.token)).statusCode, 401);
  });
});
