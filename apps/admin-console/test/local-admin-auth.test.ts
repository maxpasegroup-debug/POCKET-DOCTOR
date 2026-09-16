import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { createLocalAdminAuth, loadLocalAdminSetup } from '../local-admin-auth.mjs';
import { adminDevelopmentConfig } from '../vite.config.mjs';
import { adminOtpPreview } from '../src/auth-api.ts';
import { totp } from '../../../services/api/src/modules/admin/security.ts';

function fixture() {
  const setup = { userId: randomUUID(), phone: '+919999999990', key: Array.from(randomBytes(32), b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[b % 32]).join('') };
  const token = randomBytes(32).toString('base64url'), challengeId = randomUUID();
  let current = Date.now();
  const state = { delivery: 'testing', identityStatus: 200, elevateStatus: 200, user: { id: setup.userId, roles: ['ADMIN'] }, fail: false, oversized: false, clockOffset: 0, missingDate: false };
  const requests: { path: string; body?: any }[] = [];
  const helper = createLocalAdminAuth({ apiBase: 'https://api.example.invalid/api/v1', setup, now: () => current,
    transport: async (url: string, options: any) => {
      assert.equal(options.redirect, 'error'); assert.ok(options.signal); assert.equal(options.headers.Cookie, undefined);
      const path = new URL(url).pathname.replace('/api/v1', '');
      const body = options.body ? JSON.parse(options.body) : undefined; requests.push({ path, body });
      if (state.fail) throw new Error('private transport details');
      if (state.oversized) return new Response('x'.repeat(66000));
      if (path === '/auth/otp/request') return Response.json({ data: { delivery: state.delivery, challengeId } });
      if (path === '/auth/otp/verify') return Response.json({ data: { token, expiresAt: new Date(current + 3600000).toISOString(), user: state.user } });
      assert.equal(options.headers.Authorization, 'Bearer ' + token);
      if (path === '/auth/session') return Response.json({ data: { user: state.user } }, { status: state.identityStatus, headers: state.missingDate ? {} : { Date: new Date(current + state.clockOffset).toUTCString() } });
      assert.equal(path, '/admin/session/elevate');
      assert.equal(body.code, totp(setup.key, BigInt(Math.floor((current + state.clockOffset) / 30000))));
      return Response.json(state.elevateStatus === 200 ? { data: { elevated: true } } : { error: { code: 'MFA_INVALID' } }, { status: state.elevateStatus });
    },
  });
  const login = async () => {
    await helper.handle('/auth/otp/request', { phone: setup.phone, context: 'ADMIN' });
    await helper.handle('/auth/otp/verify', { challengeId, context: 'ADMIN', code: '000000' });
  };
  const elevate = () => helper.handle('/_local/admin/elevate', {}, 'Bearer ' + token);
  return { setup, helper, state, requests, token, challengeId, login, elevate, expire: () => { current += 3600001; } };
}

test('local automatic check requires witnessed testing login and keeps key/code off the browser', async () => {
  const f = fixture(); await f.login();
  const response = await f.elevate(); assert.equal(response.status, 200);
  assert.deepEqual(response.payload, { data: { elevated: true } });
  assert.deepEqual(f.requests.map(r => r.path), ['/auth/otp/request', '/auth/otp/verify', '/auth/session', '/admin/session/elevate']);
  assert.equal(JSON.stringify(response).includes(f.setup.key), false);
  assert.equal(JSON.stringify(response).includes(f.requests.at(-1)!.body.code), false);
});
test('automatic check uses the trusted upstream clock and refuses missing server time', async () => {
  const f = fixture(); f.state.clockOffset = 15 * 60000; await f.login();
  assert.equal((await f.elevate()).status, 200);
  const missing = fixture(); missing.state.missingDate = true; await missing.login();
  assert.equal((await missing.elevate()).status, 503);
  assert.equal(missing.requests.some(r => r.path === '/admin/session/elevate'), false);
});

test('provider and development OTP never authorize automatic checking; client claims cannot substitute', async () => {
  for (const delivery of ['provider', 'development']) {
    const f = fixture(); f.state.delivery = delivery; await f.login();
    assert.equal((await f.elevate()).status, 403);
    assert.equal(f.requests.some(r => r.path === '/admin/session/elevate'), false);
  }
  const f = fixture();
  await f.helper.handle('/auth/otp/verify', { challengeId: f.challengeId, context: 'ADMIN', delivery: 'testing' });
  assert.equal((await f.elevate()).status, 403);
});
test('other accounts, roles and missing Bearer cannot use the local private key', async () => {
  for (const user of [{ id: randomUUID(), roles: ['ADMIN'] }, { roles: ['USER'] }, { roles: ['DOCTOR'] }, { roles: ['ADMIN', 'USER'] }]) {
    const f = fixture(); f.state.user = { ...f.state.user, ...user }; await f.login();
    assert.equal((await f.elevate()).status, 403);
  }
  const f = fixture(); await f.login();
  assert.equal((await f.helper.handle('/_local/admin/elevate', {})).status, 403);
});
test('revoked or expired sessions cannot complete automatic MFA', async () => {
  const f = fixture(); await f.login(); f.state.identityStatus = 401;
  assert.equal((await f.elevate()).status, 401);
  assert.equal(f.requests.some(r => r.path === '/admin/session/elevate'), false);
  const expired = fixture(); await expired.login(); expired.expire();
  assert.equal((await expired.elevate()).status, 403);
});
test('backend MFA rejection stays a failure and is not retried automatically', async () => {
  const f = fixture(); await f.login(); f.state.elevateStatus = 403;
  const response = await f.elevate(); assert.equal(response.status, 403);
  assert.equal(response.payload.error.code, 'LOCAL_TEST_CHECK_FAILED');
  assert.equal(f.requests.filter(r => r.path === '/admin/session/elevate').length, 1);
});
test('transport errors and oversized replies fail without leaking private details', async () => {
  for (const mode of ['fail', 'oversized'] as const) {
    const f = fixture(); f.state[mode] = true;
    const response = await f.helper.handle('/auth/otp/request', { phone: f.setup.phone, context: 'ADMIN' });
    assert.equal(response.status, 503); assert.equal(JSON.stringify(response).includes('private transport details'), false);
  }
});
test('helper is absent from production and preview; private artifacts are denied by the dev server', () => {
  const f = fixture();
  for (const extra of [{ command: 'build' }, { command: 'serve', isPreview: true }]) {
    const config = adminDevelopmentConfig({ ...extra, apiBase: 'https://api.example.invalid/api/v1', localAdminSetup: f.setup });
    assert.equal(config.define['import.meta.env.VITE_LOCAL_ADMIN_AUTO_CHECK'], 'false');
    assert.equal(config.plugins, undefined);
  }
  const config = adminDevelopmentConfig({ command: 'serve', apiBase: 'https://api.example.invalid/api/v1', localAdminSetup: f.setup });
  assert.ok(config.server!.fs.deny.includes('**/artifacts/**'));
  assert.equal(JSON.stringify(config.define).includes(f.setup.key), false);
  assert.equal(loadLocalAdminSetup('nonexistent-private-setup.json'), undefined);
  assert.ok(!adminOtpPreview({ challengeId: 'example', delivery: 'testing', developmentCode: '123456' }, false, true)!.includes('authenticator code is still required'));
});
test('local endpoint rejects GET and malformed/oversized bodies without an upstream request', async () => {
  for (const [method, content, status] of [['GET', '{}', 405], ['POST', '[1]', 400], ['POST', 'x'.repeat(4200), 413]] as const) {
    const f = fixture(), request = Object.assign(Readable.from([Buffer.from(content)]), { method, url: '/api/v1/_local/admin/elevate', headers: { 'content-type': 'application/json' } });
    const response = { statusCode: 0, setHeader() {}, end() {} };
    await f.helper.middleware(request, response, () => assert.fail('Unexpected forwarding'));
    assert.equal(response.statusCode, status); assert.equal(f.requests.length, 0);
  }
});
