import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const enabled = process.env.AUTH_INTEGRATION === 'true' && Boolean(process.env.DATABASE_URL);

function configuration(): NodeJS.ProcessEnv {
  // The real worker performs cleanup: never run these checks against a deployed
  // or non-test database, even if integration testing was accidentally enabled.
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname.endsWith('_test'),
    'Deployment process tests require an isolated loopback test database');
  return {
    ...process.env, APP_ENV: 'production', NODE_ENV: 'production',
    SESSION_SECRET: randomBytes(32).toString('hex'), ADMIN_SECURITY_MODE: 'disabled', ADMIN_TOTP_KEYS: '{}',
    OTP_MODE: 'disabled', SMS_PROVIDER: 'disabled', EMAIL_PROVIDER: 'disabled', PUSH_PROVIDER: 'disabled',
    AI_PROVIDER: 'disabled', PAYMENT_MODE: 'disabled', WHATSAPP_MODE: 'disabled', WHATSAPP_OUTBOUND: 'disabled',
    DEMO_PROGRAMS: 'false', DEMO_CONSULTATIONS: 'false', DEMO_WELLNESS: 'false',
    DOCTOR_REGISTRATION_DEFER_DOCUMENTS: 'false', DOCTOR_CREDENTIAL_STORAGE: 'disabled',
    HOST: '127.0.0.1', LOG_LEVEL: 'silent', CORS_ORIGINS: 'https://admin.example.invalid',
  };
}

function launch(args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += String(chunk); });
  child.stderr.on('data', chunk => { output += String(chunk); });
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject); child.once('close', resolve);
  });
  const deadline = setTimeout(() => child.kill(), 60000);
  void closed.finally(() => clearTimeout(deadline)).catch(() => {});
  return { child, closed, output: () => output };
}

test('compiled production API honors PORT, readiness, exact CORS and disabled authentication', { skip: !enabled, timeout: 65000 }, async () => {
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address(); assert.ok(address && typeof address !== 'string');
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const env: NodeJS.ProcessEnv = { ...configuration(), PORT: String(address.port) };
  const running = launch(['dist/server.js'], env);
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const get = (path: string, init?: RequestInit) => fetch(base + path, { ...init, signal: AbortSignal.timeout(3000) });
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      assert.equal(running.child.exitCode, null, 'Compiled API exited before readiness');
      try { ready = (await get('/health/ready')).status === 200; } catch { /* wait for listener */ }
      if (ready) break;
      await delay(250);
    }
    assert.ok(ready, 'Compiled API did not become ready');
    assert.equal((await get('/health')).status, 200);
    const allowed = await get('/health', { headers: { origin: env.CORS_ORIGINS! } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), env.CORS_ORIGINS);
    const denied = await get('/health', { headers: { origin: 'https://unapproved.example.invalid' } });
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    for (const path of ['/auth/session', '/users/me', '/admin/operations/metrics']) {
      assert.equal((await get(path)).status, 401);
    }
    const otp = await get('/auth/otp/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: '+919000000000' }) });
    assert.equal(otp.status, 503);
    assert.equal((await otp.json() as { error: { code: string } }).error.code, 'OTP_UNAVAILABLE');
    assert.ok(!running.output().includes(env.SESSION_SECRET!));
  } finally { running.child.kill('SIGTERM'); await running.closed; }
});

test('compiled PostgreSQL worker completes a production-configured cycle with providers disabled', { skip: !enabled, timeout: 65000 }, async () => {
  const env = configuration();
  const running = launch(['dist/worker.js', '--once'], env);
  assert.equal(await running.closed, 0, 'Worker must complete successfully');
  assert.match(running.output(), /"event":"worker_cycle"/);
  assert.doesNotMatch(running.output(), /worker_cycle_failed/);
  assert.ok(!running.output().includes(env.SESSION_SECRET!));
});

test('read-only migration audit verifies applied history and checksums', { skip: !enabled, timeout: 65000 }, async () => {
  const running = launch(['--import', 'tsx', 'scripts/check-migrations.ts'], configuration());
  assert.equal(await running.closed, 0, 'Migration history must match the release files');
  const result = JSON.parse(running.output().trim());
  assert.equal(result.status, 'PASS');
  assert.ok(result.files > 0);
  assert.equal(result.files, result.applied);
  assert.equal(result.files, result.matched);
  assert.equal(result.unfinished, 0);
  assert.equal(result.readOnly, true);
});

test('compiled worker schedules another cycle without Redis and stops on termination', { skip: !enabled, timeout: 65000 }, async () => {
  const running = launch(['dist/worker.js'], configuration());
  try {
    const deadline = Date.now() + 50000;
    while ((running.output().match(/"event":"worker_cycle"/g)?.length ?? 0) < 2 && Date.now() < deadline) {
      assert.equal(running.child.exitCode, null, 'Worker exited before the next scheduled cycle');
      await delay(250);
    }
    assert.ok((running.output().match(/"event":"worker_cycle"/g)?.length ?? 0) >= 2);
    assert.doesNotMatch(running.output(), /worker_cycle_failed/);
  } finally { running.child.kill('SIGTERM'); await running.closed; }
  // Windows kills the process rather than delivering POSIX SIGTERM. Only CI on
  // Linux can establish that the actual graceful shutdown completed normally.
  if (process.platform !== 'win32') assert.equal(running.child.exitCode, 0);
});
