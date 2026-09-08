import assert from 'node:assert/strict';
import { randomBytes, randomInt } from 'node:crypto';
import test from 'node:test';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/database/database.js';
import { readEnvironment } from '../src/config/env.js';
import { hashToken } from '../src/modules/auth/identity-service.js';

test('complete identity lifecycle and abuse controls on isolated PostgreSQL', {
  skip: process.env.AUTH_INTEGRATION !== 'true' || !process.env.DATABASE_URL,
}, async t => {
  const database = createDatabase(process.env.DATABASE_URL!);
  const prisma = database.client!;
  const app = await buildApp(readEnvironment({ APP_ENV: 'test', OTP_MODE: 'development', SESSION_SECRET: randomBytes(32).toString('hex') }), database);
  const phones: string[] = [];
  let requests = 0;
  const newPhone = () => { const phone = `+919${randomInt(0, 1000000000).toString().padStart(9, '0')}`; phones.push(phone); return phone; };
  const call = (path: string, payload?: unknown, token?: string, method: 'GET' | 'POST' | 'PATCH' = 'POST') => app.inject({
    method, url: `/api/v1${path}`, remoteAddress: `127.0.1.${++requests}`,
    ...(payload === undefined ? {} : { payload: payload as object }),
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  });
  const requestOtp = async (phone = newPhone()) => {
    const response = await call('/auth/otp/request', { phone });
    assert.equal(response.statusCode, 200);
    return { ...response.json().data, phone };
  };
  const verify = (challenge: { challengeId: string; developmentCode: string }) => call('/auth/otp/verify', { challengeId: challenge.challengeId, code: challenge.developmentCode });
  t.after(async () => {
    await prisma.user.deleteMany({ where: { phone: { in: phones } } });
    await prisma.otpChallenge.deleteMany({ where: { phone: { in: phones } } });
    await app.close();
  });

  await t.test('phone and OTP validation', async () => {
    assert.equal((await call('/auth/otp/request', { phone: '123' })).statusCode, 400);
    assert.equal((await call('/auth/otp/verify', { challengeId: 'bad', code: 'abc' })).statusCode, 400);
  });
  const challenge = await requestOtp();
  await t.test('random challenge is hashed, cooldown survives independent requests', async () => {
    assert.match(challenge.developmentCode, /^\d{6}$/);
    const stored = await prisma.otpChallenge.findUniqueOrThrow({ where: { id: challenge.challengeId } });
    assert.equal(stored.codeHash.length, 64);
    assert.notEqual(stored.codeHash, challenge.developmentCode);
    assert.equal((await call('/auth/otp/request', { phone: challenge.phone })).statusCode, 429);
  });
  let token = '';
  let userId = '';
  await t.test('verification consumes OTP once, grants only USER and stores a hashed session', async () => {
    const results = await Promise.all([verify(challenge), verify(challenge)]);
    assert.deepEqual(results.map(response => response.statusCode).sort(), [200, 400]);
    const data = results.find(response => response.statusCode === 200)!.json().data;
    token = data.token; userId = data.user.id;
    assert.deepEqual(data.user.roles, ['USER']);
    assert.equal(data.user.profileComplete, false);
    const session = await prisma.session.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
    assert.notEqual(session.tokenHash, token);
    assert.equal((await call('/auth/session', undefined, token, 'GET')).statusCode, 200);
  });
  await t.test('profile validation and ownership; update roundtrip', async () => {
    const profile = { fullName: 'Test Person', language: 'en', interests: ['Sleep'], notifications: false };
    assert.equal((await call('/users/me', profile, undefined, 'PATCH')).statusCode, 401);
    assert.equal((await call('/users/me', { ...profile, roles: ['ADMIN'] }, token, 'PATCH')).statusCode, 400);
    assert.equal((await call('/users/me', { ...profile, fullName: ' ' }, token, 'PATCH')).statusCode, 400);
    assert.equal((await call('/users/me', { ...profile, interests: ['unsupported'] }, token, 'PATCH')).statusCode, 400);
    assert.equal((await call('/users/me', profile, token, 'PATCH')).statusCode, 200);
    const user = (await call('/users/me', undefined, token, 'GET')).json().data.user;
    assert.equal(user.fullName, 'Test Person');
    assert.equal(user.profileComplete, true);
    assert.deepEqual(user.interests, ['Sleep']);
    assert.ok(!('sessions' in user));
  });
  await t.test('logout revokes session; login restores same user and profile', async () => {
    assert.equal((await call('/auth/logout', {}, token)).statusCode, 200);
    assert.equal((await call('/users/me', undefined, token, 'GET')).statusCode, 401);
    await prisma.otpChallenge.update({ where: { phone: challenge.phone }, data: { requestedAt: new Date(Date.now() - 61000) } });
    const next = await requestOtp(challenge.phone);
    const data = (await verify(next)).json().data;
    assert.equal(data.user.id, userId);
    assert.equal(data.user.fullName, 'Test Person');
    token = data.token;
  });
  await t.test('expired session is rejected', async () => {
    await prisma.session.update({ where: { tokenHash: hashToken(token) }, data: { expiresAt: new Date(0) } });
    assert.equal((await call('/auth/session', undefined, token, 'GET')).statusCode, 401);
  });
  await t.test('five wrong attempts lock the challenge', async () => {
    const locked = await requestOtp();
    const wrong = locked.developmentCode === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) assert.equal((await call('/auth/otp/verify', { challengeId: locked.challengeId, code: wrong })).statusCode, 400);
    assert.equal((await verify(locked)).statusCode, 400);
    assert.equal((await prisma.otpChallenge.findUniqueOrThrow({ where: { id: locked.challengeId } })).attempts, 5);
  });
  await t.test('expired OTP and superseded OTP are rejected', async () => {
    const expired = await requestOtp();
    await prisma.otpChallenge.update({ where: { id: expired.challengeId }, data: { expiresAt: new Date(0), requestedAt: new Date(Date.now() - 61000) } });
    assert.equal((await verify(expired)).statusCode, 400);
    await requestOtp(expired.phone);
    assert.equal((await verify(expired)).statusCode, 400);
  });
  await t.test('hourly request cap survives cooldown and concurrent resends', async () => {
    const capped = await requestOtp();
    await prisma.otpChallenge.update({ where: { id: capped.challengeId }, data: { requestedAt: new Date(Date.now() - 61000), requestCount: 5 } });
    assert.equal((await call('/auth/otp/request', { phone: capped.phone })).statusCode, 429);
    const phone = newPhone();
    const results = await Promise.all([call('/auth/otp/request', { phone }), call('/auth/otp/request', { phone })]);
    assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 429]);
  });
});

test('development OTP cannot be enabled in staging or production', () => {
  for (const APP_ENV of ['staging', 'production']) {
    assert.throws(() => readEnvironment({ APP_ENV, OTP_MODE: 'development', SESSION_SECRET: randomBytes(32).toString('hex'), DATABASE_URL: 'postgresql://localhost/test' }), /OTP_MODE/);
  }
  assert.throws(() => readEnvironment({ OTP_MODE: 'development' }), /SESSION_SECRET/);
});
