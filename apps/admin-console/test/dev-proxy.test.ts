import test from 'node:test';
import assert from 'node:assert/strict';
import { adminDevelopmentConfig } from '../vite.config.mjs';
import { browserApiBase } from '../src/api.ts';

const hosted = 'https://pocket-doctor-production.up.railway.app/api/v1';
test('hosted development uses a loopback forwarder; production and preview never enable it', () => {
  const local = adminDevelopmentConfig({ command: 'serve', apiBase: hosted });
  const proxy = local.server!.proxy['^/api/v1(?:/|$)'];
  assert.equal(proxy.target, 'https://pocket-doctor-production.up.railway.app');
  assert.equal(proxy.secure, true); assert.equal(proxy.proxyTimeout, 12000);
  assert.equal(local.server!.host, '127.0.0.1');
  assert.equal(browserApiBase(hosted, true, true, 'http://127.0.0.1:5173'), 'http://127.0.0.1:5173/api/v1');
  assert.equal(browserApiBase(hosted, false, true, 'https://admin.example.invalid'), hosted);
  assert.equal(adminDevelopmentConfig({ command: 'build', apiBase: hosted }).define['import.meta.env.VITE_DEV_API_PROXY'], 'false');
  assert.equal(adminDevelopmentConfig({ command: 'serve', isPreview: true, apiBase: hosted }).server, undefined);
  assert.equal(adminDevelopmentConfig({ command: 'serve', apiBase: 'http://127.0.0.1:3000/api/v1' }).server, undefined);
  assert.throws(() => browserApiBase(hosted, true, true, 'https://untrusted.example.invalid'));
  assert.throws(() => adminDevelopmentConfig({ command: 'serve', apiBase: 'https://user:password@example.invalid/api/v1' }));
});

test('local API forwarding rejects foreign origins and host headers before contacting the backend', () => {
  const config = adminDevelopmentConfig({ command: 'serve', apiBase: hosted });
  let middleware: (req: any, res: any, next: () => void) => void;
  config.plugins![0].configureServer({ middlewares: { use: (handler: typeof middleware) => { middleware = handler; } } });
  for (const headers of [
    { host: '127.0.0.1:5173', origin: 'https://untrusted.example.invalid' },
    { host: 'untrusted.example.invalid' },
    { host: '127.0.0.1:5173', 'sec-fetch-site': 'cross-site' },
  ]) {
    let forwarded = false, responseBody = '';
    const response = { statusCode: 200, setHeader() {}, end(body: string) { responseBody = body; } };
    middleware!({ url: '/api/v1/auth/otp/request', headers }, response, () => { forwarded = true; });
    assert.equal(forwarded, false); assert.equal(response.statusCode, 403);
    assert.equal(JSON.parse(responseBody).error.code, 'LOCAL_ORIGIN_NOT_ALLOWED');
  }
  let forwarded = false;
  middleware!({ url: '/api/v1/health', headers: { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173' } }, {}, () => { forwarded = true; });
  assert.equal(forwarded, true);
});
