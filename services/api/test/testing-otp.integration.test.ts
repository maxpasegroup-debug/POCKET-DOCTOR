import assert from 'node:assert/strict';
import { randomBytes, randomInt } from 'node:crypto';
import test from 'node:test';
import { buildApp } from '../src/app.js';
import { readEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/database/database.js';
import { IdentityService } from '../src/modules/auth/identity-service.js';

test('hosted OTP preview requires staging and remains forbidden in production', () => {
  const input = { NODE_ENV: 'production', OTP_MODE: 'testing', ADMIN_SECURITY_MODE: 'disabled',
    SESSION_SECRET: randomBytes(32).toString('hex'), DATABASE_URL: 'postgresql://localhost/test' };
  assert.equal(readEnvironment({ ...input, APP_ENV: 'staging' }).HOST, '0.0.0.0');
  assert.throws(() => readEnvironment({ ...input, APP_ENV: 'production' }), /OTP_MODE/);
  assert.throws(() => readEnvironment({ ...input, APP_ENV: 'development' }), /OTP_MODE/);
  assert.throws(() => readEnvironment({ ...input, APP_ENV: 'staging', OTP_MODE: 'development' }), /OTP_MODE/);
});

test('hosted testing OTP lifecycle and privilege isolation on PostgreSQL', {
  skip: process.env.AUTH_INTEGRATION !== 'true' || !process.env.DATABASE_URL,
}, async t => {
  const database = createDatabase(process.env.DATABASE_URL!);
  const db = database.client!;
  const env = readEnvironment({ APP_ENV: 'staging', NODE_ENV: 'production', OTP_MODE: 'testing',
    ADMIN_SECURITY_MODE: 'disabled', SESSION_SECRET: randomBytes(32).toString('hex'), DATABASE_URL: process.env.DATABASE_URL });
  const app = await buildApp(env, database);
  const identity = new IdentityService(db, env, { send: async () => { assert.fail('Testing must never send SMS'); } });
  const realIdentity = new IdentityService(db, { ...env, OTP_MODE: 'provider' });
  const phones: string[] = [];
  const phone = () => { const value = `+919${randomInt(1_000_000_000).toString().padStart(9, '0')}`; phones.push(value); return value; };
  let requests = 0;
  const call = (path: string, payload?: object, token?: string) => app.inject({
    method: payload ? 'POST' : 'GET', url: `/api/v1${path}`, remoteAddress: `127.0.2.${++requests}`,
    ...(payload ? { payload } : {}), ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  });
  const challenge = async (number: string) => {
    const response = await call('/auth/otp/request', { phone: number });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().data as { challengeId: string; developmentCode: string; delivery: string };
  };
  const verify = (value: { challengeId: string; developmentCode: string }) => call('/auth/otp/verify', {
    challengeId: value.challengeId, code: value.developmentCode,
  });
  t.after(async () => {
    await db.user.deleteMany({ where: { phone: { in: phones } } });
    await db.otpChallenge.deleteMany({ where: { phone: { in: phones } } });
    await app.close();
  });
  const number = phone();
  let token = '';
  let userId = '';
  await t.test('new mobile receives a backend code, verifies once and restores its Patient session', async () => {
    const value = await challenge(number);
    assert.equal(value.delivery, 'testing');
    assert.match(value.developmentCode, /^\d{6}$/);
    const stored = await db.otpChallenge.findUniqueOrThrow({ where: { id: value.challengeId } });
    assert.notEqual(stored.codeHash, value.developmentCode);
    assert.equal((await call('/auth/otp/request', { phone: number })).statusCode, 429);
    const response = await verify(value);
    assert.equal(response.statusCode, 200, response.body);
    const data = response.json().data;
    token = data.token; userId = data.user.id;
    assert.deepEqual(data.user.roles, ['USER']);
    assert.equal((await verify(value)).statusCode, 400);
    assert.equal((await call('/auth/session', undefined, token)).statusCode, 200);
    assert.ok(await new IdentityService(db, env).verify(token));
    assert.equal(await realIdentity.verify(token), null);
  });
  await t.test('logout revokes access and an existing Patient logs back into the same account', async () => {
    assert.equal((await call('/auth/logout', {}, token)).statusCode, 200);
    assert.equal((await call('/auth/session', undefined, token)).statusCode, 401);
    await db.otpChallenge.update({ where: { phone: number }, data: { requestedAt: new Date(0) } });
    const response = await verify(await challenge(number));
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().data.user.id, userId);
    token = response.json().data.token;
  });
  await t.test('Doctor, Admin, mixed roles and suspended accounts cannot receive previews', async () => {
    for (const roles of [['DOCTOR'], ['ADMIN'], ['USER', 'ADMIN']] as const) {
      const number = phone();
      await db.user.create({ data: { phone: number, roles: { create: roles.map(role => ({ role })) } } });
      assert.equal((await call('/auth/otp/request', { phone: number })).statusCode, 403);
      assert.equal(await db.otpChallenge.findUnique({ where: { phone: number } }), null);
    }
    const number = phone();
    await db.user.create({ data: { phone: number, accountStatus: 'SUSPENDED', roles: { create: { role: 'USER' } } } });
    assert.equal((await call('/auth/otp/request', { phone: number })).statusCode, 403);
    await assert.rejects(identity.requestOtp(phone(), 'DOCTOR_REGISTRATION'), /Patient test accounts/);
    await assert.rejects(identity.requestOtp(phone(), 'DOCTOR_LOGIN'), /Patient test accounts/);
  });
  await t.test('role changes after request or after login cannot promote preview access', async () => {
    const number = phone();
    const value = await challenge(number);
    await db.user.create({ data: { phone: number, roles: { create: { role: 'ADMIN' } } } });
    assert.equal((await verify(value)).statusCode, 400);
    await db.userRole.create({ data: { userId, role: 'DOCTOR' } });
    assert.equal((await call('/auth/session', undefined, token)).statusCode, 401);
    await db.userRole.deleteMany({ where: { userId, role: 'DOCTOR' } });
  });
  await t.test('incorrect, expired and cross-mode challenges never create sessions', async () => {
    const value = await challenge(phone());
    const wrongCode = value.developmentCode === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) assert.equal((await verify({ ...value, developmentCode: wrongCode })).statusCode, 400);
    assert.equal((await verify(value)).statusCode, 400);
    const expired = await challenge(phone());
    await db.otpChallenge.update({ where: { id: expired.challengeId }, data: { expiresAt: new Date(0) } });
    assert.equal((await verify(expired)).statusCode, 400);
    const crossMode = await challenge(phone());
    await assert.rejects(realIdentity.verifyOtp(crossMode.challengeId, crossMode.developmentCode), /incorrect or has expired/);
    assert.equal((await verify(crossMode)).statusCode, 200);
  });
  await t.test('server ignores a client-selected role and rejects a Doctor verification context', async () => {
    // Fastify strips unknown request properties. Verify the authoritative result,
    // rather than assuming the framework rejects extra fields with HTTP 400.
    const spoofed = await call('/auth/otp/request', { phone: phone(), role: 'ADMIN' });
    assert.equal(spoofed.statusCode, 200);
    const signedIn = await verify(spoofed.json().data);
    assert.equal(signedIn.statusCode, 200);
    assert.deepEqual(signedIn.json().data.user.roles, ['USER']);
    const value = await challenge(phone());
    assert.equal((await call('/auth/otp/verify', { challengeId: value.challengeId, code: value.developmentCode, context: 'DOCTOR' })).statusCode, 400);
    const direct = await identity.requestOtp(phone());
    assert.equal(direct.delivery, 'testing');
  });
});
