import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { hasDataMount, clamavScanner, assertRailwayVolume } from '../src/modules/doctor-registration/railway-volume.js';
import { configuredRegistration } from '../src/modules/doctor-registration/local-store.js';
import { readEnvironment, EnvironmentConfigurationError } from '../src/config/env.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const configuration = () => ({
  APP_ENV:'production', NODE_ENV:'production', ADMIN_SECURITY_MODE:'disabled',
  DATABASE_URL:'postgresql://localhost/credential_test', SESSION_SECRET:randomBytes(32).toString('hex'),
  DOCTOR_CREDENTIAL_STORAGE:'railway-volume', DOCTOR_CREDENTIAL_ROOT:'/data/pocketdoctor/credentials',
  DOCTOR_CREDENTIAL_KEY:randomBytes(32).toString('base64'), DOCTOR_CREDENTIAL_SCANNER:'/usr/bin/clamscan',
  DOCTOR_REQUIRED_CREDENTIALS:'REGISTRATION', RAILWAY_VOLUME_MOUNT_PATH:'/data',
});

test('Railway mode accepts full configuration but rejects missing mount, key, policy and document bypass', () => {
  const input = configuration();
  assert.doesNotThrow(() => readEnvironment(input));
  assert.equal(readEnvironment({...input,APP_ENV:'staging'}).DOCTOR_CREDENTIAL_STORAGE, 'railway-volume');
  for (const field of ['DOCTOR_CREDENTIAL_ROOT', 'DOCTOR_CREDENTIAL_KEY', 'DOCTOR_CREDENTIAL_SCANNER', 'DOCTOR_REQUIRED_CREDENTIALS', 'RAILWAY_VOLUME_MOUNT_PATH']) {
    assert.throws(() => readEnvironment({...input, [field]:''}));
  }
  for (const root of ['data/pocketdoctor/credentials', '/app/uploads', '/data/../app/credentials']) {
    assert.throws(() => readEnvironment({...input, DOCTOR_CREDENTIAL_ROOT:root}));
  }
  assert.throws(() => readEnvironment({...input, DOCTOR_REGISTRATION_DEFER_DOCUMENTS:'true'}));
  assert.throws(() => readEnvironment({...input, DOCTOR_CREDENTIAL_STORAGE:'local-test'}));
});

test('Railway prerequisite errors identify exact variable names without blaming the supported mode or exposing secrets', () => {
  const input = configuration();
  const invalid = {
    DOCTOR_CREDENTIAL_ROOT:'/unexpected/private/path', DOCTOR_CREDENTIAL_KEY:'SENSITIVE-INVALID-KEY',
    DOCTOR_CREDENTIAL_SCANNER:'/unexpected/private/scanner', DOCTOR_REQUIRED_CREDENTIALS:'',
    RAILWAY_VOLUME_MOUNT_PATH:'/wrong-mount', DOCTOR_REGISTRATION_DEFER_DOCUMENTS:'true',
  };
  for (const [field, value] of Object.entries(invalid)) {
    assert.throws(() => readEnvironment({...input,[field]:value}), error => {
      assert.ok(error instanceof EnvironmentConfigurationError);
      assert.equal(error.message, `Invalid environment configuration: ${field}`);
      assert.ok(!error.message.includes(input.DOCTOR_CREDENTIAL_KEY));
      if (value) assert.ok(!error.message.includes(value));
      return true;
    });
  }
  assert.throws(() => readEnvironment({...input,DOCTOR_CREDENTIAL_KEY:'',DOCTOR_REQUIRED_CREDENTIALS:''}),
    {message:'Invalid environment configuration: DOCTOR_CREDENTIAL_KEY, DOCTOR_REQUIRED_CREDENTIALS'});
  assert.throws(() => readEnvironment({...input,DOCTOR_CREDENTIAL_STORAGE:'unknown-mode'}),
    {message:'Invalid environment configuration: DOCTOR_CREDENTIAL_STORAGE'});
});

test('compiled volume entrypoint preserves safe actionable environment errors before attempting filesystem operations', async () => {
  const result = await promisify(execFile)(process.execPath, ['dist/prepare-credential-volume.js'], {
    timeout:10000, windowsHide:true, env:{...process.env,...configuration(),DOCTOR_CREDENTIAL_KEY:'SENSITIVE-INVALID-KEY'},
  }).then(() => assert.fail('Invalid configuration must fail startup'), error => error as {code:number;stderr:string});
  assert.equal(result.code, 1);
  assert.equal(result.stderr.trim(), 'Invalid environment configuration: DOCTOR_CREDENTIAL_KEY');
});

test('mount detection rejects writable ordinary directories, read-only and nested replacement mounts', () => {
  const root = '1 0 0:1 / / rw,relatime - overlay overlay rw';
  const data = '2 1 8:1 / /data rw,relatime - ext4 /dev/disk rw';
  assert.equal(hasDataMount(root), false);
  assert.equal(hasDataMount(root + '\n' + data), true);
  assert.equal(hasDataMount(data.replace('/data rw,', '/data ro,')), false);
  assert.equal(hasDataMount(data.replace('/data ', '/data-other ')), false);
  assert.equal(hasDataMount(data.replace('ext4', 'tmpfs')), false);
  assert.equal(hasDataMount(data.replace('ext4', 'overlay')), false);
  assert.equal(hasDataMount(data + '\n3 2 0:2 / /data/pocketdoctor rw - tmpfs tmpfs rw'), false);
});

test('configured Railway factory refuses a Windows runtime despite plausible Railway variables', { skip:process.platform !== 'win32' }, () => {
  const env = readEnvironment(configuration());
  assert.throws(() => assertRailwayVolume(env));
  assert.throws(() => configuredRegistration(env));
});

test('ClamAV contract scans privately with bounded limits and shares a successful signature refresh', async () => {
  const calls: {executable:string; args:string[]; timeout:number}[] = [];
  const scanner = clamavScanner(async (executable,args,timeout) => { calls.push({executable,args,timeout}); });
  await scanner.initialize();
  await scanner.scan('/data/pocketdoctor/credentials/synthetic.scan');
  await scanner.scan('/data/pocketdoctor/credentials/second.scan');
  assert.equal(calls.filter(c => c.executable === '/usr/bin/freshclam').length, 1);
  assert.equal(calls[0]!.timeout, 120000);
  const scan = calls[1]!;
  assert.equal(scan.executable, '/usr/bin/clamscan');
  assert.equal(scan.timeout, 60000);
  assert.ok(scan.args.includes('--alert-exceeds-max=yes'));
  assert.ok(scan.args.includes('--alert-encrypted=yes'));
  assert.ok(scan.args.includes('--tempdir=/data/pocketdoctor/credentials'));
  assert.deepEqual(scan.args.slice(-2), ['--','/data/pocketdoctor/credentials/synthetic.scan']);
});

test('ClamAV unavailable signatures, infection and scanner failure all fail closed without private error details', async () => {
  for (const failedProgram of ['/usr/bin/freshclam', '/usr/bin/clamscan']) {
    const scanner = clamavScanner(async executable => {
      if (executable === failedProgram) throw new Error('SENSITIVE scanner diagnostic');
    });
    await assert.rejects(() => scanner.scan('/private/synthetic.scan'), error => {
      assert.equal((error as {code:string}).code, 'PRIVATE_STORAGE_UNAVAILABLE');
      assert.doesNotMatch(String(error), /SENSITIVE|synthetic/);
      return true;
    });
  }
});

test('ClamAV concurrent requests do not create an unbounded scan queue', async () => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const scanner = clamavScanner(async executable => { if (executable === '/usr/bin/clamscan') await blocked; });
  await scanner.initialize();
  const first = scanner.scan('/private/first.scan');
  await assert.rejects(() => scanner.scan('/private/second.scan'));
  release(); await first;
});
