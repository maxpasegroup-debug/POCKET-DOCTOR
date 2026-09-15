import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../src/api.ts';
import { adminOtpPreview, requestAdminOtp, verifyAdminOtp } from '../src/auth-api.ts';

test('Admin request and verification both send explicit Admin context without role assignment', async () => {
  const calls: { path: string; body: Record<string, string> }[] = [];
  const api = new ApiClient('https://api.example.invalid/api/v1', () => {}, () => {}, async (url, init) => {
    calls.push({ path: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json({ data: {} });
  });
  await requestAdminOtp(api, 'synthetic-placeholder'); await verifyAdminOtp(api, 'challenge', '123456');
  assert.deepEqual(calls.map(c => c.body.context), ['ADMIN', 'ADMIN']);
  assert.equal(calls[0]?.path, 'https://api.example.invalid/api/v1/auth/otp/request');
  assert.equal(calls[1]?.path, 'https://api.example.invalid/api/v1/auth/otp/verify');
  assert.ok(calls.every(c => !('role' in c.body)));
});
test('only explicit testing or local development delivery shows the preview', () => {
  const challenge = { challengeId: 'test', developmentCode: '123456' };
  assert.match(adminOtpPreview({ ...challenge, delivery: 'testing' }, false)!, /authenticator code is still required/);
  assert.equal(adminOtpPreview({ ...challenge, delivery: 'provider' }, true), undefined);
  assert.equal(adminOtpPreview({ ...challenge, delivery: 'development' }, false), undefined);
  assert.equal(adminOtpPreview(challenge, false), undefined);
});
test('staging eligibility and genuine authorization errors have distinct safe messages', async () => {
  for (const [code, expected] of [['TEST_LOGIN_NOT_ALLOWED', /not configured for testing/], ['ADMIN_LOGIN_NOT_ALLOWED', /active administrator/], ['FORBIDDEN', /cannot perform/]] as const) {
    const api = new ApiClient('', () => {}, () => {}, async () => Response.json({ error: { code, message: 'private server details' } }, { status: 403 }));
    await assert.rejects(requestAdminOtp(api, 'synthetic-placeholder'), expected);
  }
});
