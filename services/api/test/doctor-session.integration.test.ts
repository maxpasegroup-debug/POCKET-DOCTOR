import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/database/database.js';
import { readEnvironment } from '../src/config/env.js';
import { doctorCookieName } from '../src/modules/auth/doctor-session.js';

test('doctor OTP, cookie restoration and authorization', { skip: process.env.AUTH_INTEGRATION !== 'true' || !process.env.DATABASE_URL }, async t => {
  const database = createDatabase(process.env.DATABASE_URL!), db = database.client!;
  const origin = 'http://127.0.0.1:5173';
  const env = readEnvironment({ APP_ENV: 'test', OTP_MODE: 'development', SESSION_SECRET: randomBytes(32).toString('hex'), DEMO_CONSULTATIONS: 'true', CORS_ORIGINS: origin });
  const app = await buildApp(env, database);
  const users: string[] = [];
  let sequence = 0;
  const call = (url: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ url: '/api/v1' + url, method, remoteAddress: `127.14.0.${++sequence}`, headers: { origin, ...headers }, ...(payload === undefined ? {} : { payload: payload as object }) });
  t.after(async () => {
    await db.doctor.deleteMany({ where: { userId: { in: users } } });
    const rows = await db.user.findMany({ where: { id: { in: users } }, select: { phone: true } });
    await db.otpChallenge.deleteMany({ where: { phone: { in: rows.flatMap(row => row.phone ? [row.phone] : []) } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });
  async function fixture(role: 'USER' | 'DOCTOR', status?: 'VERIFIED' | 'PENDING_VERIFICATION', incomplete = false) {
    const phone = '+919' + String(BigInt('0x' + randomBytes(6).toString('hex')) % 1000000000n).padStart(9, '0');
    const user = await db.user.create({ data: { phone, fullName: 'DEMO login regression', roles: { create: { role } } } }); users.push(user.id);
    if (status) await db.doctor.create({ data: { userId: user.id, name: 'DEMO login professional', qualification: 'DEMO', specialty: 'DEMO', biography: incomplete ? '' : 'Synthetic test profile', languages: ['en'], verificationStatus: status, isDemo: true } });
    const requested = await call('/auth/otp/request', 'POST', { phone }); assert.equal(requested.statusCode, 200);
    return { user, challenge: requested.json().data };
  }
  async function signIn(f: Awaited<ReturnType<typeof fixture>>) {
    const response = await call('/auth/otp/verify', 'POST', { challengeId: f.challenge.challengeId, code: f.challenge.developmentCode });
    assert.equal(response.statusCode, 200);
    return response.json().data.token as string;
  }
  async function exchange(token: string) {
    const response = await call('/doctor/session', 'POST', undefined, { authorization: `Bearer ${token}` });
    assert.equal(response.statusCode, 200);
    const value = response.headers['set-cookie'] as string;
    assert.match(value, /HttpOnly/); assert.match(value, /SameSite=Strict/); assert.match(value, /Path=\/api\/v1\/doctor/);
    assert.ok(!JSON.stringify(response.json()).includes(token));
    return value.split(';')[0]!;
  }
  await t.test('valid doctor OTP opens profile and agenda; refresh restores the same session; logout revokes it', async () => {
    const f = await fixture('DOCTOR', 'VERIFIED'), token = await signIn(f), cookie = await exchange(token);
    for (let refresh = 0; refresh < 2; refresh++) {
      const state = await call('/doctor/session', 'GET', undefined, { cookie });
      assert.equal(state.statusCode, 200); assert.equal(state.json().data.status, 'READY');
      const profile = await call('/doctor/profile', 'GET', undefined, { cookie }); assert.equal(profile.statusCode, 200);
      assert.equal(profile.json().data.doctor.id, state.json().data.doctor.id);
      assert.equal((await call('/doctor/appointments', 'GET', undefined, { cookie })).statusCode, 200);
    }
    const ended = await call('/doctor/session', 'DELETE', undefined, { cookie }); assert.equal(ended.statusCode, 200);
    assert.match(ended.headers['set-cookie'] as string, /Max-Age=0/);
    assert.equal((await call('/doctor/session', 'GET', undefined, { cookie })).statusCode, 401);
    assert.equal((await call('/auth/session', 'GET', undefined, { authorization: `Bearer ${token}` })).statusCode, 401);
  });
  await t.test('normal user keeps customer API access but cannot obtain or forge doctor access', async () => {
    const f = await fixture('USER'), token = await signIn(f);
    assert.equal((await call('/users/me', 'GET', undefined, { authorization: `Bearer ${token}` })).statusCode, 200);
    assert.equal((await call('/doctor/session', 'POST', undefined, { authorization: `Bearer ${token}` })).statusCode, 403);
    for (const path of ['/doctor/session', '/doctor/profile', '/doctor/appointments']) {
      assert.equal((await call(path, 'GET', undefined, { authorization: `Bearer ${token}` })).statusCode, 403);
      assert.equal((await call(path, 'GET', undefined, { cookie: `${doctorCookieName(env)}=${token}` })).statusCode, 403);
    }
    assert.equal((await call('/doctor/session')).statusCode, 401);
  });
  await t.test('missing and incomplete profiles have explicit completion states', async () => {
    for (const status of [undefined, 'VERIFIED'] as const) {
      const f = await fixture('DOCTOR', status, true), cookie = await exchange(await signIn(f));
      const result = await call('/doctor/session', 'GET', undefined, { cookie });
      assert.equal(result.json().data.status, 'PROFILE_REQUIRED'); assert.equal(result.json().data.doctor, null);
    }
  });
  await t.test('pending verification displays state without granting appointment access', async () => {
    const f = await fixture('DOCTOR', 'PENDING_VERIFICATION'), cookie = await exchange(await signIn(f));
    assert.equal((await call('/doctor/session', 'GET', undefined, { cookie })).json().data.status, 'PENDING_VERIFICATION');
    assert.equal((await call('/doctor/appointments', 'GET', undefined, { cookie })).statusCode, 403);
  });
  await t.test('invalid and expired OTP cannot establish a session', async () => {
    const f = await fixture('DOCTOR', 'VERIFIED');
    const wrong = f.challenge.developmentCode === '000000' ? '111111' : '000000';
    assert.equal((await call('/auth/otp/verify', 'POST', { challengeId: f.challenge.challengeId, code: wrong })).statusCode, 400);
    await db.otpChallenge.update({ where: { id: f.challenge.challengeId }, data: { expiresAt: new Date(0) } });
    assert.equal((await call('/auth/otp/verify', 'POST', { challengeId: f.challenge.challengeId, code: f.challenge.developmentCode })).statusCode, 400);
    assert.equal(await db.session.count({ where: { userId: f.user.id } }), 0);
  });
  await t.test('cookie requires approved origin and cannot authorize admin routes; expired and suspended users fail', async () => {
    const f = await fixture('DOCTOR', 'VERIFIED'), token = await signIn(f), cookie = await exchange(token);
    assert.equal((await call('/doctor/session', 'GET', undefined, { cookie, origin: 'https://untrusted.invalid' })).statusCode, 403);
    assert.equal((await call('/doctor/session', 'DELETE', undefined, { cookie, origin: 'https://untrusted.invalid' })).statusCode, 403);
    assert.equal((await call('/admin/operations/metrics', 'GET', undefined, { authorization: `Bearer ${token}` })).statusCode, 403);
    assert.equal((await call('/admin/operations/metrics', 'GET', undefined, { cookie })).statusCode, 401);
    await db.user.update({ where: { id: f.user.id }, data: { accountStatus: 'SUSPENDED' } });
    assert.equal((await call('/doctor/session', 'GET', undefined, { cookie })).statusCode, 401);
    await db.user.update({ where: { id: f.user.id }, data: { accountStatus: 'ACTIVE' } });
    await db.session.updateMany({ where: { userId: f.user.id }, data: { expiresAt: new Date(0) } });
    assert.equal((await call('/doctor/session', 'GET', undefined, { cookie })).statusCode, 401);
  });
});

test('production doctor session uses the secure cookie namespace', () => {
  assert.equal(doctorCookieName({ APP_ENV: 'production' } as never), '__Secure-pd_doctor_session');
});
