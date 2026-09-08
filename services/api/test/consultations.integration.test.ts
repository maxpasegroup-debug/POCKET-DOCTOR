import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { buildApp } from '../src/app.js';
import { readEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/database/database.js';
import { hashToken } from '../src/modules/auth/identity-service.js';
import { availabilityInput, generateSlots } from '../src/modules/consultations/availability.js';
import { verifyRazorpayWebhook } from '../src/modules/programs/webhook-verification.js';
import { UnavailableConsultationProvider } from '../src/modules/consultations/session-provider.js';
import { ConsultationService } from '../src/modules/consultations/consultation-service.js';

test('webhook verification rejects tampering and unconfigured consultation access fails closed', async () => {
  const secret = randomBytes(32).toString('hex');
  const raw = Buffer.from('{"event":"payment.captured"}');
  const signature = createHmac('sha256', secret).update(raw).digest('hex');
  assert.equal(verifyRazorpayWebhook(raw, signature, secret), true);
  assert.equal(verifyRazorpayWebhook(Buffer.from('{}'), signature, secret), false);
  assert.equal(verifyRazorpayWebhook(raw, signature, ''), false);
  assert.equal(verifyRazorpayWebhook(raw, 'client-success', secret), false);
  await assert.rejects(new UnavailableConsultationProvider().createAccess(), /not available/);
});

test('availability validates breaks, timezone, real dates and DST instants', () => {
  const base = { timezone: 'Asia/Kolkata', consultationMinutes: 30, bufferMinutes: 10, acceptingAppointments: true,
    windows: [{ weekday: 1, startMinute: 540, endMinute: 660 }], excludedDates: [] };
  assert.ok(availabilityInput.safeParse(base).success);
  assert.ok(!availabilityInput.safeParse({ ...base, windows: [...base.windows, ...base.windows] }).success);
  assert.ok(!availabilityInput.safeParse({ ...base, excludedDates: ['2026-02-30'] }).success);
  assert.ok(!availabilityInput.safeParse({ ...base, timezone: 'Not/AZone' }).success);
  const slots = generateSlots('2026-09-07', base, new Date('2026-09-01'));
  assert.equal(slots.length, 3);
  assert.equal(slots[0]!.startsAt.toISOString(), '2026-09-07T03:30:00.000Z');
  const midnightSlot = generateSlots('2026-09-07', { ...base, bufferMinutes: 0, windows: [{ weekday: 1, startMinute: 1410, endMinute: 1440 }] }, new Date('2026-09-01'));
  assert.equal(midnightSlot.length, 1);
  assert.equal(midnightSlot[0]!.endsAt.toISOString(), '2026-09-07T18:30:00.000Z');
  assert.equal(generateSlots('2026-09-07', { ...base, excludedDates: ['2026-09-07'] }, new Date('2026-09-01')).length, 0);
  const dst = generateSlots('2026-11-01', { ...base, timezone: 'America/New_York', bufferMinutes: 0, windows: [{ weekday: 7, startMinute: 60, endMinute: 120 }] }, new Date('2026-10-01'));
  assert.equal(new Set(dst.map(s => s.startsAt.toISOString())).size, dst.length);
  assert.ok(dst.some(s => s.startsAt.toISOString().includes('T05:00')));
  assert.ok(dst.some(s => s.startsAt.toISOString().includes('T06:00')));
  assert.throws(() => readEnvironment({ APP_ENV: 'production', DATABASE_URL: 'postgresql://localhost/test', DEMO_CONSULTATIONS: 'true' }));
});

test('consultation lifecycle, concurrent booking, payments and private records on PostgreSQL', { skip: process.env.AUTH_INTEGRATION !== 'true' || !process.env.DATABASE_URL }, async t => {
  const database = createDatabase(process.env.DATABASE_URL!);
  const db = database.client!;
  const env = readEnvironment({ APP_ENV: 'test', DEMO_CONSULTATIONS: 'true', PAYMENT_MODE: 'development', CANCELLATION_WINDOW_MINUTES: '0' });
  const app = await buildApp(env, database);
  const users = await Promise.all(['USER', 'USER', 'DOCTOR', 'DOCTOR'].map(role => db.user.create({ data: { fullName: 'DEMO tester', roles: { create: { role: role as 'USER' | 'DOCTOR' } } } })));
  const tokens = users.map(() => randomBytes(32).toString('base64url'));
  await db.session.createMany({ data: users.map((u, i) => ({ userId: u.id, tokenHash: hashToken(tokens[i]!), expiresAt: new Date(Date.now() + 3600000) })) });
  const doctor = await db.doctor.create({ data: { name: 'DEMO consultation professional', qualification: 'DEMO, not a real qualification', specialty: `Sample ${randomUUID()}`, biography: 'Test profile only', isDemo: true, verificationStatus: 'VERIFIED', userId: users[2]!.id, acceptingAppointments: true, languages: ['english'], feePaise: 10000,
    availability: { create: Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, startMinute: 540, endMinute: 1080 })) } } });
  const another = await db.doctor.create({ data: { name: 'DEMO unrelated doctor', qualification: 'DEMO', specialty: 'Sample', biography: 'Test only', isDemo: true, verificationStatus: 'VERIFIED', userId: users[3]!.id } });
  let requests = 0;
  const call = (path: string, body?: object, actor = 0, method?: 'PATCH') => app.inject({ method: method ?? (body ? 'POST' : 'GET'), url: `/api/v1${path}`, remoteAddress: `127.3.0.${++requests}`, headers: { authorization: `Bearer ${tokens[actor]}` }, ...(body ? { payload: body } : {}) });
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  let bookedId = '', payer = 0, paymentId = '';
  t.after(async () => {
    await db.enrollmentPayment.deleteMany({ where: { userId: { in: users.map(u => u.id) } } });
    await db.consultationNote.deleteMany({ where: { consultation: { doctorId: doctor.id } } });
    await db.consultation.deleteMany({ where: { doctorId: doctor.id } });
    await db.doctor.deleteMany({ where: { id: { in: [doctor.id, another.id] } } });
    await db.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } });
    await app.close();
  });
  await t.test('discovery excludes unverified doctors; DTOs omit verification identifiers', async () => {
    assert.equal((await app.inject('/api/v1/doctors')).statusCode, 401);
    assert.equal((await call('/doctors/not-a-uuid')).statusCode, 400);
    assert.equal((await call(`/doctors?q=english&specialty=${encodeURIComponent(doctor.specialty)}`)).json().data.doctors.length, 1);
    const profile = (await call(`/doctors/${doctor.id}`)).json().data.doctor;
    assert.equal(profile.isDemo, true); assert.equal(profile.verified, false);
    assert.equal(profile.providerAvailable, false); assert.equal(profile.userId, undefined);
    await db.doctor.update({ where: { id: doctor.id }, data: { verificationStatus: 'SUSPENDED' } });
    assert.equal((await call(`/doctors/${doctor.id}`)).statusCode, 404);
    await db.doctor.update({ where: { id: doctor.id }, data: { verificationStatus: 'VERIFIED' } });
    assert.ok((await call('/specialties')).json().data.specialties.includes(doctor.specialty));
  });
  await t.test('two simultaneous users claim one slot; database rejects direct overlap', async () => {
    const slots = (await call(`/doctors/${doctor.id}/slots?date=${date}`)).json().data.slots;
    assert.ok(slots.length > 1);
    const body = { doctorId: doctor.id, date, startsAt: slots[0].startsAt };
    const results = await Promise.all([call('/consultations/book', body, 0), call('/consultations/book', body, 1)]);
    assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
    payer = results[0]!.statusCode === 200 ? 0 : 1;
    bookedId = results[payer]!.json().data.consultation.id;
    assert.equal(await db.consultation.count({ where: { doctorId: doctor.id } }), 1);
    const a = await db.consultation.findUniqueOrThrow({ where: { id: bookedId } });
    await assert.rejects(db.consultation.create({ data: { userId: users[1 - payer]!.id, doctorId: doctor.id, startsAt: new Date(a.startsAt.getTime() + 60000), endsAt: a.endsAt, reservedUntil: a.reservedUntil, timezone: a.timezone, feePaise: 1, holdExpiresAt: a.holdExpiresAt } }));
    assert.equal((await call(`/me/consultations/${bookedId}`, undefined, 1 - payer)).statusCode, 404);
  });
  await t.test('server prices payment, failure retries and duplicate callbacks confirm once', async () => {
    assert.equal((await call(`/consultations/${bookedId}/payment`, { amountPaise: 1 }, payer)).statusCode, 400);
    paymentId = (await call(`/consultations/${bookedId}/payment`, {}, payer)).json().data.payment.id;
    assert.equal((await call(`/consultation-payments/${paymentId}/development-settle`, { outcome: 'capture' }, 1 - payer)).statusCode, 404);
    assert.equal((await call(`/consultation-payments/${paymentId}/development-settle`, { outcome: 'fail' }, payer)).json().data.consultation.status, 'PENDING_PAYMENT');
    const payment = (await call(`/consultations/${bookedId}/payment`, {}, payer)).json().data.payment;
    assert.notEqual(payment.id, paymentId); assert.equal(payment.amountPaise, 10000);
    assert.equal((await call(`/me/consultations/${bookedId}`, undefined, payer)).json().data.consultation.paymentStatus, 'PENDING');
    paymentId = payment.id;
    const results = await Promise.all([1, 2].map(() => call(`/consultation-payments/${paymentId}/development-settle`, { outcome: 'capture' }, payer)));
    assert.ok(results.every(r => r.json().data.consultation.status === 'CONFIRMED'));
    assert.equal(await db.enrollmentPayment.count({ where: { consultationId: bookedId, status: 'VERIFIED' } }), 1);
    assert.equal(await db.consultation.count({ where: { id: bookedId, status: 'CONFIRMED' } }), 1);
    assert.ok(await db.consultationReminder.count({ where: { consultationId: bookedId } }) > 0);
  });
  await t.test('rescheduling is atomic; cancellation records honest refund state', async () => {
    const original = await db.consultation.findUniqueOrThrow({ where: { id: bookedId } });
    assert.equal((await call(`/consultations/${bookedId}/reschedule`, { date, startsAt: new Date(original.startsAt.getTime() + 60000).toISOString() }, payer)).statusCode, 409);
    assert.equal((await db.consultation.findUniqueOrThrow({ where: { id: bookedId } })).startsAt.toISOString(), original.startsAt.toISOString());
    const slots = (await call(`/doctors/${doctor.id}/slots?date=${date}`)).json().data.slots;
    assert.equal((await call(`/consultations/${bookedId}/reschedule`, { date, startsAt: slots[0].startsAt }, payer)).statusCode, 200);
    assert.equal((await call(`/consultations/${bookedId}/cancel`, {}, 1 - payer)).statusCode, 404);
    const cancelled = (await call(`/consultations/${bookedId}/cancel`, {}, payer)).json().data.consultation;
    assert.equal(cancelled.status, 'CANCELLED'); assert.equal(cancelled.refundStatus, 'REVIEW_REQUIRED');
    assert.equal((await call(`/consultations/${bookedId}/cancel`, {}, payer)).statusCode, 200);
    assert.equal((await call(`/consultation-payments/${paymentId}/development-settle`, { outcome: 'capture' }, payer)).json().data.consultation.status, 'CANCELLED');
  });
  await t.test('assigned doctor only; private notes never appear in patient responses', async () => {
    assert.equal((await call('/doctor/appointments')).statusCode, 403);
    assert.equal((await call('/doctor/profile', { verificationStatus: 'VERIFIED' }, 2, 'PATCH')).statusCode, 400);
    assert.equal((await call('/doctor/availability', undefined, 2)).statusCode, 200);
    assert.equal((await call('/doctor/appointments', undefined, 3)).json().data.consultations.length, 0);
    // Controlled DB fixture models an already completed consultation; no fake live connection.
    await db.consultation.update({ where: { id: bookedId }, data: { status: 'COMPLETED', completedAt: new Date() } });
    const note = { privateNote: 'private clinical fixture', summary: 'Shared demo summary', followUpRequired: true, followUpDate: date, followUpNote: 'Demo follow-up only' };
    assert.equal((await call(`/doctor/consultations/${bookedId}/notes`, note, 3)).statusCode, 404);
    assert.equal((await call(`/doctor/consultations/${bookedId}/notes`, note, 2)).statusCode, 200);
    const patient = await call(`/me/consultations/${bookedId}`, undefined, payer);
    assert.equal(patient.json().data.consultation.note.summary, note.summary);
    assert.ok(!patient.body.includes(note.privateNote)); assert.ok(!patient.body.includes('privateNote'));
    assert.ok((await call('/doctor/appointments', undefined, 2)).body.includes(note.privateNote));
  });
  await t.test('expired holds cannot confirm and release their slot on subsequent booking', async () => {
    const slots = (await call(`/doctors/${doctor.id}/slots?date=${date}`)).json().data.slots;
    const body = { doctorId: doctor.id, date, startsAt: slots[0].startsAt };
    const a = (await call('/consultations/book', body)).json().data.consultation;
    const p = (await call(`/consultations/${a.id}/payment`, {})).json().data.payment;
    await db.consultation.update({ where: { id: a.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await call(`/consultation-payments/${p.id}/development-settle`, { outcome: 'capture' })).statusCode, 409);
    assert.equal((await call('/consultations/book', body, 1)).statusCode, 200);
    assert.equal((await db.consultation.findUniqueOrThrow({ where: { id: a.id } })).status, 'EXPIRED');
  });
  await t.test('doctor availability, profile ownership, free booking and cancellation policy', async () => {
    const config = { timezone: 'Asia/Kolkata', consultationMinutes: 30, bufferMinutes: 10, acceptingAppointments: true,
      windows: Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, startMinute: 540, endMinute: 1080 })), excludedDates: [] };
    assert.equal((await call('/doctor/availability', config)).statusCode, 403);
    assert.equal((await call('/doctor/availability', config, 2)).statusCode, 200);
    assert.equal((await call('/doctor/profile', { biography: 'Updated demo biography', languages: ['English'] }, 2, 'PATCH')).statusCode, 200);
    assert.deepEqual((await call(`/doctors/${doctor.id}`)).json().data.doctor.languages, ['english']);
    await db.doctor.update({ where: { id: doctor.id }, data: { feePaise: 0 } });
    const slots = (await call(`/doctors/${doctor.id}/slots?date=${date}`)).json().data.slots;
    const free = (await call('/consultations/book', { doctorId: doctor.id, date, startsAt: slots.at(-1).startsAt })).json().data.consultation;
    assert.equal(free.status, 'CONFIRMED'); assert.equal(free.paymentStatus, 'NOT_REQUIRED');
    assert.equal((await call(`/consultations/${free.id}/payment`, {})).statusCode, 409);
    const restrictive = new ConsultationService(db, { ...env, CANCELLATION_WINDOW_MINUTES: 10080 });
    await assert.rejects(restrictive.cancel(users[0]!.id, free.id), /no longer be changed/);
    assert.equal((await call(`/consultations/${free.id}/cancel`, {})).statusCode, 200);
    await db.doctor.update({ where: { id: doctor.id }, data: { verificationStatus: 'SUSPENDED' } });
    assert.equal((await call('/doctor/appointments', undefined, 2)).statusCode, 403);
    assert.equal((await call('/doctor/availability', config, 2)).statusCode, 403);
  });
});
