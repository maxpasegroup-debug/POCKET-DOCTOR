import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/app.js';
import { readEnvironment } from '../src/config/env.js';
import { authenticate, authorize } from '../src/modules/auth/authorization.js';
import { unavailableSessionVerifier } from '../src/modules/auth/contracts.js';

const env = readEnvironment({ APP_ENV: 'test' });

test('liveness works without a database; readiness is honest; future APIs are absent', async t => {
  const app = await buildApp(env);
  t.after(() => app.close());
  const health = await app.inject('/api/v1/health');
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().data.status, 'ok');
  assert.equal(health.headers['cache-control'], 'no-store');
  assert.ok(health.headers['x-content-type-options']);
  assert.ok(health.headers['x-request-id']);
  assert.equal((await app.inject('/api/v1/health/ready')).statusCode, 503);
  assert.equal((await app.inject('/api/v1/programs')).statusCode, 503);
  const missing = await app.inject('/api/v1/consultations');
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.code, 'NOT_FOUND');
});

test('readiness probes database and closes it', async t => {
  let probes = 0;
  let closed = false;
  const app = await buildApp(env, { async ping() { probes++; }, async close() { closed = true; } });
  t.after(() => app.close());
  assert.equal((await app.inject('/api/v1/health/ready')).statusCode, 200);
  assert.equal(probes, 1);
  await app.close();
  assert.equal(closed, true);
});

test('database and unexpected errors never expose details', async t => {
  const app = await buildApp(env, { async ping() { throw new Error('private-database-secret'); }, async close() {} });
  app.get('/test-error', async () => { throw new Error('private-health-data'); });
  t.after(() => app.close());
  const ready = await app.inject('/api/v1/health/ready');
  assert.equal(ready.statusCode, 503);
  assert.ok(!ready.body.includes('private'));
  const error = await app.inject('/test-error');
  assert.equal(error.statusCode, 500);
  assert.ok(!error.body.includes('private'));
});

test('configuration rejects unsafe deployments and hides values', () => {
  assert.throws(() => readEnvironment({ APP_ENV: 'production' }), /DATABASE_URL/);
  assert.throws(() => readEnvironment({ NODE_ENV: 'production' }), /APP_ENV/);
  assert.throws(() => readEnvironment({ CORS_ORIGINS: '*' }), /CORS_ORIGINS/);
  assert.throws(() => readEnvironment({ DATABASE_URL: 'secret' }), error => !String(error).includes('secret'));
});

test('authentication fails closed and role guard denies unauthorized callers', async t => {
  const app = await buildApp(env);
  app.get('/protected', async request => {
    await authenticate(request, unavailableSessionVerifier);
    return { unreachable: true };
  });
  t.after(() => app.close());
  for (const headers of [{}, { authorization: 'Bearer fabricated' }, { authorization: 'Basic fabricated' }]) {
    assert.equal((await app.inject({ url: '/protected', headers })).statusCode, 401);
  }
  const principal = { userId: 'test', sessionId: 'test', roles: ['USER'] as const };
  assert.throws(() => authorize(principal, ['ADMIN']), /Access denied/);
  assert.doesNotThrow(() => authorize(principal, ['USER']));
});

test('request validation, rate limiting and exact CORS origin policy', async t => {
  const app = await buildApp(readEnvironment({ APP_ENV: 'test', CORS_ORIGINS: 'http://localhost:8080' }));
  app.get('/validated', { schema: { querystring: { type: 'object', properties: { count: { type: 'integer', minimum: 1 } }, required: ['count'] } } }, async () => ({ ok: true }));
  app.get('/limited', { config: { rateLimit: { max: 1, timeWindow: '1 minute' } } }, async () => ({ ok: true }));
  t.after(() => app.close());
  assert.equal((await app.inject('/validated?count=bad')).statusCode, 400);
  assert.equal((await app.inject('/limited')).statusCode, 200);
  assert.equal((await app.inject('/limited')).statusCode, 429);
  const allowed = await app.inject({ url: '/api/v1/health', headers: { origin: 'http://localhost:8080' } });
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:8080');
  const denied = await app.inject({ url: '/api/v1/health', headers: { origin: 'https://untrusted.example' } });
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
});
