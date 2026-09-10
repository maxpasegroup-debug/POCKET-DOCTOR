import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomInt } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { readEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/database/database.js';
import { configuredRegistration } from '../src/modules/doctor-registration/local-store.js';

test('Doctor registration entry and approval preserve account boundaries on PostgreSQL', {
  skip: process.env.AUTH_INTEGRATION !== 'true' || !process.env.DATABASE_URL,
}, async t => {
  const database = createDatabase(process.env.DATABASE_URL!), db = database.client!;
  const env = readEnvironment({ APP_ENV: 'test', OTP_MODE: 'development',
    SESSION_SECRET: randomBytes(32).toString('hex'), ADMIN_SECURITY_MODE: 'development',
    DOCTOR_REGISTRATION_DEFER_DOCUMENTS: 'true' });
  const app = await buildApp(env, database, configuredRegistration(env));
  const phones: string[] = [], users: string[] = [];
  let sequence = 0;
  const call = (url: string, payload?: object, token?: string, method: 'GET' | 'POST' | 'PATCH' = 'POST') => app.inject({
    method, url: '/api/v1' + url, remoteAddress: `127.32.${Math.floor(++sequence / 250)}.${sequence % 250 + 1}`,
    ...(payload ? { payload } : {}), headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  async function fresh() {
    let phone: string;
    do { phone = '+919' + randomInt(1e9).toString().padStart(9, '0'); }
    while (phones.includes(phone) || await db.user.findUnique({ where: { phone } }));
    phones.push(phone); return phone;
  }
  async function existing(role: 'USER' | 'ADMIN' | 'DOCTOR') {
    const phone = await fresh();
    const user = await db.user.create({ data: { phone, roles: { create: { role } } } });
    users.push(user.id);
    const q = await call('/auth/otp/request', { phone });
    const v = await call('/auth/otp/verify', { challengeId: q.json().data.challengeId, code: q.json().data.developmentCode });
    assert.equal(v.statusCode, 200);
    return { phone, id: user.id, token: v.json().data.token as string };
  }
  t.after(async () => {
    await db.doctor.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.otpChallenge.deleteMany({ where: { phone: { in: phones } } });
    await app.close();
  });
  const phone = await fresh(), patient = await existing('USER'), admin = await existing('ADMIN');
  let challenge: { challengeId: string; developmentCode: string }, token = '', userId = '', doctorId = '';
  const profile = { name: 'SYNTHETIC Entry Applicant', registrationEmail: 'entry@example.invalid',
    registrationDateOfBirth: '', registrationGender: '', qualification: 'SYNTHETIC qualification',
    specialty: 'SYNTHETIC education', biography: 'Synthetic application for registration validation.',
    registrationAuthority: 'SYNTHETIC council', registrationNumber: 'SYNTHETIC-ENTRY',
    experienceYears: 3, languages: ['English'], feePaise: 10000 };
  await t.test('new Doctor sign-in directs registration and never creates USER or OTP', async () => {
    const r = await call('/auth/otp/request', { phone, context: 'DOCTOR' });
    assert.equal(r.statusCode, 409); assert.equal(r.json().error.code, 'DOCTOR_REGISTRATION_REQUIRED');
    assert.equal(await db.user.count({ where: { phone } }), 0);
    assert.equal(await db.otpChallenge.count({ where: { phone } }), 0);
  });
  await t.test('same genuinely new number immediately starts registration', async () => {
    const r = await call('/doctor/registration/otp/request', { phone });
    assert.equal(r.statusCode, 200); challenge = r.json().data;
    assert.equal(await db.user.count({ where: { phone } }), 0);
  });
  await t.test('OTP purpose, invalid code and client role cannot grant access', async () => {
    const payload = { challengeId: challenge.challengeId, code: challenge.developmentCode };
    assert.equal((await call('/auth/otp/verify', { ...payload, context: 'DOCTOR' })).statusCode, 400);
    assert.equal((await call('/auth/otp/verify', payload)).statusCode, 400);
    assert.equal((await call('/doctor/registration/otp/verify', { ...payload, role: 'ADMIN' })).statusCode, 400);
    const wrong = String((Number(challenge.developmentCode) + 1) % 1e6).padStart(6, '0');
    assert.equal((await call('/doctor/registration/otp/verify', { ...payload, code: wrong })).statusCode, 400);
    assert.equal(await db.user.count({ where: { phone } }), 0);
  });
  await t.test('verified registration OTP creates one pending applicant and prevents replay', async () => {
    const payload = { challengeId: challenge.challengeId, code: challenge.developmentCode };
    const r = await call('/doctor/registration/otp/verify', payload);
    assert.equal(r.statusCode, 200); token = r.json().data.token; userId = r.json().data.user.id; users.push(userId);
    const d = await db.doctor.findUniqueOrThrow({ where: { userId } }); doctorId = d.id;
    assert.equal(d.verificationStatus, 'PENDING_VERIFICATION'); assert.equal(d.acceptingAppointments, false);
    assert.equal((await call('/doctor/registration/otp/verify', payload)).statusCode, 400);
  });
  await t.test('draft and submitted applicants cannot access operations or patient data', async () => {
    for (const url of ['/doctor/appointments', '/doctor/profile', '/doctor/availability', '/admin/operations/dashboard']) {
      assert.equal((await call(url, undefined, token, 'GET')).statusCode, 403, url);
    }
    assert.equal((await call('/doctor/registration', undefined, patient.token, 'GET')).statusCode, 403);
  });
  await t.test('basic/professional details persist; deferred documents allow pending submission', async () => {
    assert.equal((await call('/doctor/registration/submit', {}, token)).statusCode, 400);
    assert.equal((await call('/doctor/registration', profile, token, 'PATCH')).statusCode, 200);
    const r = await call('/doctor/registration/submit', {}, token);
    assert.equal(r.statusCode, 200); assert.equal(r.json().data.status, 'SUBMITTED');
    assert.equal(r.json().data.documentPolicy.deferred, true);
    assert.equal(r.json().data.profile.name, profile.name);
    assert.equal(await db.doctorCredential.count({ where: { doctorId } }), 0);
    assert.equal((await call('/doctor/appointments', undefined, token, 'GET')).statusCode, 403);
  });
  async function recover(expected: string) {
    // Advance only this fixture's resend clock; keep attempt/window limits intact.
    await db.otpChallenge.update({ where: { phone }, data: { requestedAt: new Date(Date.now() - 61000) } });
    const q = await call('/doctor/registration/otp/request', { phone }); assert.equal(q.statusCode, 200);
    const r = await call('/doctor/registration/otp/verify', { challengeId: q.json().data.challengeId, code: q.json().data.developmentCode });
    assert.equal(r.statusCode, 200); assert.equal(r.json().data.user.id, userId); token = r.json().data.token;
    const view = await call('/doctor/registration', undefined, token, 'GET');
    assert.equal(view.json().data.id, doctorId); assert.equal(view.json().data.status, expected);
    assert.equal(await db.doctor.count({ where: { userId } }), 1);
  }
  const review = () => '/admin/operations/doctors/' + doctorId + '/registration/review';
  await t.test('pending registration recovers the same locked application', async () => {
    await recover('SUBMITTED');
    assert.equal((await call('/doctor/registration', profile, token, 'PATCH')).statusCode, 409);
  });
  await t.test('unauthenticated, Patient and applicant cannot approve', async () => {
    assert.equal((await call(review(), { action: 'APPROVE' })).statusCode, 401);
    for (const actor of [patient.token, token]) assert.equal((await call(review(), { action: 'APPROVE' }, actor)).statusCode, 403);
  });
  await t.test('Admin review and rejection preserve correction and resubmission', async () => {
    assert.equal((await call(review(), { action: 'BEGIN_REVIEW' }, admin.token)).json().data.status, 'UNDER_REVIEW');
    assert.equal((await call(review(), { action: 'REJECT', reason: 'Synthetic correction required.' }, admin.token)).statusCode, 200);
    await recover('REJECTED');
    assert.equal((await call('/doctor/appointments', undefined, token, 'GET')).statusCode, 403);
    assert.equal((await call('/doctor/registration', profile, token, 'PATCH')).statusCode, 200);
    assert.equal((await call('/doctor/registration/submit', {}, token)).statusCode, 200);
  });
  await t.test('Admin approval gives VERIFIED/READY and Home operations', async () => {
    assert.equal((await call(review(), { action: 'APPROVE' }, admin.token)).json().data.status, 'VERIFIED');
    assert.equal((await call('/doctor/session', undefined, token, 'GET')).json().data.status, 'READY');
    for (const url of ['/doctor/appointments', '/doctor/profile', '/doctor/availability']) {
      assert.equal((await call(url, undefined, token, 'GET')).statusCode, 200, url);
    }
    assert.equal((await call('/admin/operations/dashboard', undefined, token, 'GET')).statusCode, 403);
  });
  await t.test('verified Doctor registration recovers Home without duplicate/reset', async () => {
    await recover('VERIFIED');
    assert.equal((await call('/doctor/session', undefined, token, 'GET')).json().data.status, 'READY');
    assert.equal((await call('/doctor/registration', profile, token, 'PATCH')).statusCode, 409);
  });
  await t.test('suspension survives registration recovery and blocks operations', async () => {
    assert.equal((await call(review(), { action: 'SUSPEND' }, admin.token)).statusCode, 200);
    await recover('SUSPENDED');
    assert.equal((await call('/doctor/session', undefined, token, 'GET')).json().data.status, 'SUSPENDED');
    assert.equal((await call('/doctor/appointments', undefined, token, 'GET')).statusCode, 403);
    assert.equal((await call('/doctor/registration/submit', {}, token)).statusCode, 409);
  });
  await t.test('existing Patient policy and strict server role selection remain unchanged', async () => {
    assert.equal((await call('/doctor/registration/otp/request', { phone: patient.phone })).statusCode, 403);
    assert.equal((await call('/auth/otp/request', { phone: patient.phone, context: 'DOCTOR' })).statusCode, 403);
    assert.equal((await call('/doctor/registration/otp/request', { phone: await fresh(), role: 'DOCTOR' })).statusCode, 400);
    assert.deepEqual((await db.userRole.findMany({ where: { userId: patient.id } })).map(r => r.role), ['USER']);
  });
  await t.test('Doctor sign-in reuses LOGIN purpose; registration cannot consume it', async () => {
    const d = await existing('DOCTOR');
    await db.otpChallenge.update({ where: { phone: d.phone }, data: { requestedAt: new Date(Date.now() - 61000) } });
    const q = await call('/auth/otp/request', { phone: d.phone, context: 'DOCTOR' }); assert.equal(q.statusCode, 200);
    const payload = { challengeId: q.json().data.challengeId, code: q.json().data.developmentCode };
    assert.equal((await db.otpChallenge.findUniqueOrThrow({ where: { phone: d.phone } })).purpose, 'LOGIN');
    assert.equal((await call('/doctor/registration/otp/verify', payload)).statusCode, 400);
    assert.equal((await call('/auth/otp/verify', { ...payload, context: 'DOCTOR' })).statusCode, 200);
    assert.equal(await db.doctor.count({ where: { userId: d.id } }), 0);
  });
  await t.test('Doctor role revoked after OTP request cannot log in or create USER', async () => {
    const d = await existing('DOCTOR');
    await db.otpChallenge.update({ where: { phone: d.phone }, data: { requestedAt: new Date(Date.now() - 61000) } });
    const q = await call('/auth/otp/request', { phone: d.phone, context: 'DOCTOR' }); assert.equal(q.statusCode, 200);
    await db.userRole.deleteMany({ where: { userId: d.id } });
    const r = await call('/auth/otp/verify', { challengeId: q.json().data.challengeId, code: q.json().data.developmentCode, context: 'DOCTOR' });
    assert.equal(r.statusCode, 400); assert.equal(await db.userRole.count({ where: { userId: d.id } }), 0);
  });
});
