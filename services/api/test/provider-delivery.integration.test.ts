import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, generateKeyPairSync } from 'node:crypto';
import { createDatabase } from '../src/database/database.js';
import { readEnvironment } from '../src/config/env.js';
import { IdentityService, hashToken } from '../src/modules/auth/identity-service.js';
import { buildApp } from '../src/app.js';
import { deliverPush, decryptPushToken } from '../src/modules/notifications/push.js';
import { ConsultationService } from '../src/modules/consultations/consultation-service.js';

test('provider OTP and push lifecycle preserve identity, privacy and idempotency', { skip: process.env.AUTH_INTEGRATION !== 'true' || !process.env.DATABASE_URL }, async t => {
  const database = createDatabase(process.env.DATABASE_URL!), db = database.client!;
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const env = readEnvironment({ APP_ENV: 'test', OTP_MODE: 'provider', SMS_PROVIDER: 'twilio', SESSION_SECRET: randomBytes(32).toString('hex'), TWILIO_ACCOUNT_SID: 'AC' + randomBytes(16).toString('hex'), TWILIO_AUTH_TOKEN: randomBytes(32).toString('hex'), TWILIO_MESSAGING_SERVICE_SID: 'MG' + randomBytes(16).toString('hex'), SMS_OTP_TEMPLATE: 'Test code {code}', PUSH_PROVIDER: 'fcm', NOTIFICATION_ENCRYPTION_KEY: randomBytes(32).toString('base64'), FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'pocket-test', client_email: 'test@pocket-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }) });
  const app = await buildApp(env, database);
  const phones = [0, 1].map(() => '+918' + String(BigInt('0x' + randomBytes(6).toString('hex')) % 1000000000n).padStart(9, '0'));
  const users = await Promise.all(phones.map(phone => db.user.create({ data: { phone, notifications: true, roles: { create: { role: 'USER' } } } })));
  const tokens = users.map(() => randomBytes(32).toString('base64url'));
  const sessions = await Promise.all(users.map((user, i) => db.session.create({ data: { userId: user.id, tokenHash: hashToken(tokens[i]!), expiresAt: new Date(Date.now() + 3600000) } })));
  let request = 0;
  const call = (actor: number, path: string, method: 'POST' | 'DELETE' = 'POST', payload?: object) => app.inject({ method, url: '/api/v1' + path, remoteAddress: `127.15.0.${++request}`, headers: { authorization: `Bearer ${tokens[actor]}` }, ...(payload ? { payload } : {}) });
  t.after(async () => { await db.otpChallenge.deleteMany({ where: { phone: { in: phones } } }); await db.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } }); await app.close(); });
  await t.test('provider acceptance enables only the hashed OTP; provider failure never creates a usable challenge', async () => {
    let code = '';
    const identity = new IdentityService(db, env, { async send(phone, value) { code = value;
      const pending = await db.otpChallenge.findUniqueOrThrow({ where: { phone } }); assert.equal(pending.consumed, true); assert.notEqual(pending.codeHash, value);
    } });
    const challenge = await identity.requestOtp(phones[0]!);
    assert.equal('developmentCode' in challenge, false); assert.equal(challenge.delivery, 'provider');
    const session = await identity.verifyOtp(challenge.challengeId, code); assert.equal(session.user.id, users[0]!.id);
    await assert.rejects(identity.verifyOtp(challenge.challengeId, code));
    const failure = new IdentityService(db, env, { async send() { throw new Error('timeout'); } });
    await assert.rejects(failure.requestOtp(phones[1]!), /could not send/);
    assert.equal((await db.otpChallenge.findUniqueOrThrow({ where: { phone: phones[1]! } })).consumed, true);
  });
  await t.test('registration encrypts token, isolates accounts and refreshes within its session', async () => {
    const payload = { token: 'test-device-token-1234567890', platform: 'android', enabled: true };
    assert.equal((await call(0, '/me/push-device', 'POST', payload)).statusCode, 200);
    const stored = await db.pushDevice.findUniqueOrThrow({ where: { sessionId: sessions[0]!.id } });
    assert.notEqual(stored.tokenEncrypted, payload.token); assert.equal(decryptPushToken(stored.tokenEncrypted, env.NOTIFICATION_ENCRYPTION_KEY), payload.token);
    assert.equal((await call(1, '/me/push-device', 'POST', payload)).statusCode, 409);
    assert.equal((await call(0, '/me/push-device', 'POST', { ...payload, userId: users[1]!.id })).statusCode, 400);
    const updated = await call(0, '/me/push-device', 'POST', { ...payload, token: payload.token + '-refresh' }); assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().data.id, stored.id); assert.equal(JSON.stringify(updated.json()).includes(payload.token), false);
  });
  await t.test('push worker sends once, honors preferences and removes registrations on logout', async () => {
    await db.notification.create({ data: { userId: users[0]!.id, sourceKey: randomUUID(), kind: 'payment', route: '/notifications' } });
    let sends = 0;
    const provider = { async send() { sends++; return { status: 'SENT' as const, reference: 'test-' + randomUUID() }; } };
    await deliverPush(db, env, provider); await deliverPush(db, env, provider);
    assert.equal(sends, 1);
    await db.user.update({ where: { id: users[0]!.id }, data: { notifications: false } });
    await db.notification.create({ data: { userId: users[0]!.id, sourceKey: randomUUID(), kind: 'account', route: '/notifications' } });
    await deliverPush(db, env, provider); assert.equal(sends, 1);
    assert.equal((await call(0, '/auth/logout')).statusCode, 200);
    assert.equal(await db.pushDevice.count({ where: { sessionId: sessions[0]!.id } }), 0);
  });
  await t.test('unregistered provider token is removed; ambiguous sends are quarantined, not retried', async () => {
    await call(1, '/me/push-device', 'POST', { token: 'test-device-other-1234567890', platform: 'ios', enabled: true });
    await db.notification.create({ data: { userId: users[1]!.id, sourceKey: randomUUID(), kind: 'account', route: '/notifications' } });
    await deliverPush(db, env, { async send() { return { status: 'INVALID_DESTINATION', reason: 'UNREGISTERED' }; } });
    assert.equal(await db.pushDevice.count({ where: { userId: users[1]!.id } }), 0);
    await call(1, '/me/push-device', 'POST', { token: 'test-device-replaced-1234567890', platform: 'ios', enabled: true });
    await db.notification.create({ data: { userId: users[1]!.id, sourceKey: randomUUID(), kind: 'account', route: '/notifications' } });
    let sends = 0; const provider = { async send() { sends++; return { status: 'UNKNOWN' as const, reason: 'TIMEOUT' }; } };
    await deliverPush(db, env, provider); await deliverPush(db, env, provider); assert.equal(sends, 1);
  });
});

test('consultation access checks participant, verification, status and expiry before invoking provider', { skip: process.env.AUTH_INTEGRATION !== 'true' || !process.env.DATABASE_URL }, async t => {
  const database = createDatabase(process.env.DATABASE_URL!), db = database.client!;
  const users = await Promise.all([0, 1, 2].map(() => db.user.create({ data: {} })));
  const doctor = await db.doctor.create({ data: { userId: users[1]!.id, name: 'DEMO session test', qualification: 'DEMO', specialty: 'DEMO', biography: 'Test only', isDemo: true, verificationStatus: 'VERIFIED' } });
  const start = new Date(Date.now() - 1000), end = new Date(Date.now() + 60000);
  const appointment = await db.consultation.create({ data: { userId: users[0]!.id, doctorId: doctor.id, startsAt: start, endsAt: end, reservedUntil: end, holdExpiresAt: end, timezone: 'Asia/Kolkata', status: 'CONFIRMED', feePaise: 0 } });
  t.after(async () => { await db.consultation.delete({ where: { id: appointment.id } }); await db.doctor.delete({ where: { id: doctor.id } }); await db.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } }); await database.close(); });
  let calls = 0;
  const env = readEnvironment({ APP_ENV: 'test', DEMO_CONSULTATIONS: 'true' });
  const service = new ConsultationService(db, env, { async createAccess(input) { calls++; assert.ok(input.expiresAt <= end); return { token: 'test-provider-access', expiresAt: input.expiresAt }; } });
  await assert.rejects(service.sessionAccess(users[2]!.id, appointment.id, 'patient'));
  await assert.rejects(service.sessionAccess(users[2]!.id, appointment.id, 'doctor'));
  assert.equal(calls, 0);
  await service.sessionAccess(users[0]!.id, appointment.id, 'patient'); await service.sessionAccess(users[1]!.id, appointment.id, 'doctor'); assert.equal(calls, 2);
  await assert.rejects(new ConsultationService(db, env).sessionAccess(users[0]!.id, appointment.id, 'patient'), /not available yet/);
  await db.consultation.update({ where: { id: appointment.id }, data: { status: 'CANCELLED' } });
  await assert.rejects(service.sessionAccess(users[0]!.id, appointment.id, 'patient')); assert.equal(calls, 2);
  await db.consultation.update({ where: { id: appointment.id }, data: { status: 'CONFIRMED', endsAt: new Date(Date.now() - 1) } });
  await assert.rejects(service.sessionAccess(users[0]!.id, appointment.id, 'patient')); assert.equal(calls, 2);
});
