import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readEnvironment, EnvironmentConfigurationError } from '../src/config/env.js';

test('configuration diagnostics identify fields without disclosing supplied values', () => {
  const privateValue = 'SYNTHETIC_PRIVATE_VALUE_DO_NOT_LOG';
  assert.throws(() => readEnvironment({
    APP_ENV: 'production', NODE_ENV: 'production', ADMIN_SECURITY_MODE: 'disabled',
    DATABASE_URL: privateValue, SESSION_SECRET: 'short-private-secret',
    FCM_SERVICE_ACCOUNT_JSON: privateValue, PUSH_PROVIDER: 'fcm',
  }), error => {
    assert.ok(error instanceof EnvironmentConfigurationError);
    for (const name of ['DATABASE_URL', 'SESSION_SECRET', 'FCM_SERVICE_ACCOUNT_JSON']) {
      assert.ok(error.message.includes(name));
    }
    assert.ok(!error.message.includes(privateValue));
    assert.ok(!error.message.includes('short-private-secret'));
    return true;
  });
});

test('actual API entry point reports invalid production variable names and exits safely', async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: process.cwd(), windowsHide: true,
    env: { ...process.env, NODE_ENV: 'production', APP_ENV: 'production',
      DATABASE_URL: 'SYNTHETIC_PRIVATE_DATABASE_VALUE', SESSION_SECRET: 'short-private-secret',
      ADMIN_SECURITY_MODE: 'disabled' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += String(chunk); });
  child.stderr.on('data', chunk => { output += String(chunk); });
  const timer = setTimeout(() => child.kill(), 30000);
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject); child.once('close', resolve);
    });
    assert.equal(code, 1);
    assert.match(output, /Invalid environment configuration: /);
    assert.match(output, /DATABASE_URL/);
    assert.match(output, /SESSION_SECRET/);
    assert.ok(!output.includes('SYNTHETIC_PRIVATE_DATABASE_VALUE'));
    assert.ok(!output.includes('short-private-secret'));
  } finally { clearTimeout(timer); if (child.exitCode === null) child.kill(); }
});
