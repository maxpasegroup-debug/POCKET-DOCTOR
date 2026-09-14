import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, mkdtemp, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/database/database.js';
import { readEnvironment } from '../src/config/env.js';
import { configuredRegistration, LocalCredentialStore } from '../src/modules/doctor-registration/local-store.js';
import { railwayScanner } from '../src/modules/doctor-registration/railway-volume.js';

// Always-on integration uses real encrypted disk/DB with an explicit scanner double.
// Opt-in acceptance uses the configured real OS scanner. Neither uses deployed data.
for (const configured of [false, true]) test(configured
  ? 'configured encrypted storage acceptance with real OS scanner'
  : 'encrypted disk API lifecycle with scanner contract double and real PostgreSQL', {
  skip: configured ? process.env.RUN_LOCAL_CREDENTIAL_STORAGE !== 'true' : process.env.AUTH_INTEGRATION !== 'true', timeout: 180000,
}, async t => {
  let root = '';
  if (!configured) {
    root = await mkdtemp(path.join(tmpdir(), 'pd-encrypted-api-'));
    await chmod(root, 0o700);
    if (process.platform === 'win32') {
      const script = "$ErrorActionPreference='Stop';$p=$env:PD_TEST_ROOT;$me=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=New-Object Security.AccessControl.DirectorySecurity;$a.SetOwner($me);$a.SetAccessRuleProtection($true,$false);$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($me,'FullControl','ContainerInherit,ObjectInherit','None','Allow'));Set-Acl -LiteralPath $p -AclObject $a";
      await promisify(execFile)('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script], {windowsHide:true, env:{...process.env,PD_TEST_ROOT:root}});
    }
  }
  const env = configured ? readEnvironment() : readEnvironment({...process.env,
    APP_ENV:'test', NODE_ENV:'test', OTP_MODE:'development', ADMIN_SECURITY_MODE:'development',
    DOCTOR_CREDENTIAL_STORAGE:'disabled', DOCTOR_CREDENTIAL_ROOT:root,
    DOCTOR_CREDENTIAL_KEY:randomBytes(32).toString('base64'), DOCTOR_REGISTRATION_DEFER_DOCUMENTS:'false',
  });
  const url = new URL(env.DATABASE_URL!);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname.endsWith('_test'));
  assert.ok(['test', 'development'].includes(env.APP_ENV));
  assert.equal(env.NODE_ENV === 'production', false);
  assert.equal(env.OTP_MODE, 'development');
  if (configured) assert.ok(['local-test','railway-volume'].includes(env.DOCTOR_CREDENTIAL_STORAGE));
  assert.equal(env.DOCTOR_REGISTRATION_DEFER_DOCUMENTS, 'false');
  assert.equal(env.ADMIN_SECURITY_MODE, 'development');
  if (configured && env.DOCTOR_CREDENTIAL_STORAGE === 'railway-volume') await railwayScanner.initialize();
  const dependencies = configured ? configuredRegistration(env) : {
    store: new LocalCredentialStore(root, Buffer.from(env.DOCTOR_CREDENTIAL_KEY,'base64'), async () => {}),
    requiredKinds: ['REGISTRATION'] as const,
  };
  assert.deepEqual(dependencies.requiredKinds, ['REGISTRATION']);
  const database = createDatabase(env.DATABASE_URL!);
  let db = database.client!;
  let app = await buildApp(env, database, dependencies);
  const users: string[] = [], phones: string[] = [];
  t.after(async () => {
    try {
      const files = await db.doctorCredential.findMany({ where: { doctor: { userId: { in: users } } }, select: { objectKey: true } });
      for (const file of files) await dependencies.store!.remove(file.objectKey);
      await db.doctor.deleteMany({ where: { userId: { in: users } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.otpChallenge.deleteMany({ where: { phone: { in: phones } } });
    } finally {
      await app.close();
      if (root) await rm(root, {recursive:true,force:true}); // only this test's unique disposable root
    }
  });
  let sequence = 0;
  const call = (route: string, method: 'GET'|'POST'|'PATCH' = 'GET', body?: object, token?: string) => app.inject({
    method, url: '/api/v1' + route, remoteAddress: `127.31.0.${++sequence}`,
    headers: token ? { authorization: `Bearer ${token}` } : {}, ...(body ? { payload: body } : {}),
  });
  async function login(role?: 'USER'|'ADMIN') {
    const phone = '+919' + String(BigInt('0x' + randomBytes(6).toString('hex')) % 1000000000n).padStart(9, '0');
    phones.push(phone);
    if (role) {
      const user = await db.user.create({ data: { phone, roles: { create: { role } } } });
      users.push(user.id);
    }
    const base = role ? '/auth' : '/doctor/registration';
    const requested = await call(base + '/otp/request', 'POST', { phone });
    assert.equal(requested.statusCode, 200);
    const challenge = requested.json().data;
    const verified = await call(base + '/otp/verify', 'POST', { challengeId: challenge.challengeId, code: challenge.developmentCode });
    assert.equal(verified.statusCode, 200);
    if (!role) users.push(verified.json().data.user.id);
    return verified.json().data.token as string;
  }
  const doctor = await login(), otherDoctor = await login(), patient = await login('USER'), admin = await login('ADMIN');
  t.diagnostic('Real registration OTP and role-bound sessions: PASS');
  const application = (await call('/doctor/registration', 'GET', undefined, doctor)).json().data;
  assert.equal(application.documentPolicy.storageAvailable, true);
  assert.equal(application.documentPolicy.deferred, false);
  const profile = { name: 'SYNTHETIC storage applicant', registrationEmail: 'storage@example.invalid', registrationDateOfBirth: '1990-01-01',
    registrationGender: 'PREFER_NOT_TO_SAY', qualification: 'SYNTHETIC qualification', specialty: 'SYNTHETIC education',
    biography: 'Synthetic storage acceptance only.', registrationAuthority: 'SYNTHETIC council', registrationNumber: 'SYNTHETIC-STORAGE',
    experienceYears: 1, languages: ['English'], feePaise: 0 };
  assert.equal((await call('/doctor/registration', 'PATCH', profile, doctor)).statusCode, 200);
  assert.equal((await call('/doctor/registration/submit', 'POST', {}, doctor)).statusCode, 400);
  assert.equal((await call('/doctor/appointments', 'GET', undefined, doctor)).statusCode, 403);
  t.diagnostic('Complete draft without a required document cannot submit or access operations: PASS');
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
  const upload = await call('/doctor/registration/documents', 'POST', { kind: 'REGISTRATION', fileName: 'synthetic.png', contentType: 'image/png', contentBase64: bytes.toString('base64') }, doctor);
  assert.equal(upload.statusCode, 200, `Real storage upload failed: ${upload.json().error?.code ?? upload.statusCode}`);
  const documentId = upload.json().data.documents[0].id as string;
  const record = await db.doctorCredential.findUniqueOrThrow({ where: { id: documentId } });
  assert.equal(record.doctorId, application.id);
  assert.equal('contentBase64' in record, false);
  assert.equal('bytes' in record, false);
  const encrypted = await readFile(path.join(env.DOCTOR_CREDENTIAL_ROOT, createHash('sha256').update(record.objectKey).digest('hex') + '.enc'));
  assert.equal(encrypted.subarray(0, 4).toString(), 'PDC1');
  assert.equal(encrypted.includes(bytes), false);
  // Independent process reads only the persisted file/key; no in-memory store state.
  const childCode = `import { LocalCredentialStore } from './src/modules/doctor-registration/local-store.ts';
    import { createHash } from 'node:crypto';
    const store = new LocalCredentialStore(process.env.PD_TEST_ROOT, Buffer.from(process.env.PD_TEST_KEY,'base64'), async()=>{});
    const bytes = await store.read(process.env.PD_TEST_OBJECT);
    process.stdout.write(createHash('sha256').update(bytes).digest('hex'));`;
  const reopened = await promisify(execFile)(process.execPath, ['--import','tsx','--input-type=module','-e',childCode], {
    windowsHide:true, timeout:15000, maxBuffer:1024,
    env:{...process.env,PD_TEST_ROOT:env.DOCTOR_CREDENTIAL_ROOT,PD_TEST_KEY:env.DOCTOR_CREDENTIAL_KEY,PD_TEST_OBJECT:record.objectKey},
  });
  assert.equal(reopened.stdout, createHash('sha256').update(bytes).digest('hex'));
  const download = '/doctor/registration/documents/' + documentId;
  assert.deepEqual(Buffer.from((await call(download, 'GET', undefined, doctor)).json().data.contentBase64, 'base64'), bytes);
  assert.equal((await call(download)).statusCode, 401);
  assert.equal((await call(download, 'GET', undefined, patient)).statusCode, 403);
  assert.equal((await call(download, 'GET', undefined, otherDoctor)).statusCode, 404);
  const reviewBase = `/admin/operations/doctors/${application.id}/registration`;
  assert.equal((await call(reviewBase + '/documents/' + documentId, 'GET', undefined, doctor)).statusCode, 403);
  const reviewed = await call(reviewBase + '/documents/' + documentId, 'GET', undefined, admin);
  assert.equal(reviewed.statusCode, 200);
  assert.deepEqual(Buffer.from(reviewed.json().data.contentBase64, 'base64'), bytes);
  t.diagnostic('Encrypted upload, application association, owner isolation and Admin download: PASS');
  assert.equal((await call('/doctor/registration/submit', 'POST', {}, doctor)).json().data.status, 'SUBMITTED');
  assert.equal((await db.doctor.findUniqueOrThrow({ where: { id: application.id } })).verificationStatus, 'PENDING_VERIFICATION');
  assert.notEqual((await call('/doctor/session', 'GET', undefined, doctor)).json().data.status, 'READY');
  assert.equal((await call('/doctor/appointments', 'GET', undefined, doctor)).statusCode, 403);
  for (const token of [doctor, patient]) assert.equal((await call(reviewBase + '/review', 'POST', { action: 'APPROVE' }, token)).statusCode, 403);
  assert.equal((await call(reviewBase + '/review', 'POST', { action: 'BEGIN_REVIEW' }, admin)).json().data.status, 'UNDER_REVIEW');
  assert.equal((await call(reviewBase + '/review', 'POST', { action: 'REJECT', reason: 'Synthetic correction check' }, admin)).json().data.status, 'REJECTED');
  assert.equal((await call('/doctor/appointments', 'GET', undefined, doctor)).statusCode, 403);
  assert.equal((await call('/doctor/registration', 'PATCH', profile, doctor)).statusCode, 200);
  assert.equal((await call('/doctor/registration/submit', 'POST', {}, doctor)).statusCode, 200);
  assert.equal((await call(reviewBase + '/review', 'POST', { action: 'APPROVE' }, admin)).json().data.status, 'VERIFIED');
  assert.equal((await call('/doctor/session', 'GET', undefined, doctor)).json().data.status, 'READY');
  assert.equal((await call('/doctor/appointments', 'GET', undefined, doctor)).statusCode, 200);
  // Close/recreate the backend and database connection, retaining only disk + DB state.
  await app.close();
  const restoredDatabase = createDatabase(env.DATABASE_URL!);
  db = restoredDatabase.client!;
  app = await buildApp(env, restoredDatabase, configured ? configuredRegistration(env) : {
    store:new LocalCredentialStore(root, Buffer.from(env.DOCTOR_CREDENTIAL_KEY,'base64'), async () => {}),
    requiredKinds:['REGISTRATION'],
  });
  assert.deepEqual(Buffer.from((await call(download, 'GET', undefined, doctor)).json().data.contentBase64, 'base64'), bytes);
  assert.equal((await call('/doctor/appointments', 'GET', undefined, doctor)).statusCode, 200);
  t.diagnostic('Document retrieval and persisted session survive backend instance recreation: PASS');
  assert.equal((await call(reviewBase + '/review', 'POST', { action: 'SUSPEND', reason: 'Synthetic suspension check' }, admin)).json().data.status, 'SUSPENDED');
  assert.equal((await call('/doctor/appointments', 'GET', undefined, doctor)).statusCode, 403);
  assert.equal((await call(download, 'GET', undefined, doctor)).statusCode, 403);
  t.diagnostic('Pending/rejected restrictions, authorized approval, READY/Home and suspension: PASS');
});
