import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { buildApp } from '../src/app.js';
import { readEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/database/database.js';
import { hashToken } from '../src/modules/auth/identity-service.js';
import { PatientConnections } from '../src/modules/realtime/patient-connections.js';
import { doctorAvailableEvent, publiclyAvailable } from '../src/modules/realtime/events.js';

const waitFor = async (condition: () => boolean) => {
  const until = Date.now() + 5000;
  while (!condition() && Date.now() < until) await new Promise(r => setTimeout(r, 10));
  assert.ok(condition(), 'Expected WebSocket state before deadline');
};
test('public availability and payload allowlist exclude non-public Doctor states and private fields', () => {
  for (const verificationStatus of ['PENDING_VERIFICATION', 'REJECTED', 'SUSPENDED', 'INACTIVE'] as const)
    assert.equal(publiclyAvailable({ verificationStatus, acceptingAppointments: true, isDemo: false }), false);
  assert.equal(publiclyAvailable({ verificationStatus: 'VERIFIED', acceptingAppointments: false, isDemo: false }), false);
  assert.equal(publiclyAvailable({ verificationStatus: 'VERIFIED', acceptingAppointments: true, isDemo: true }), false);
  const row = { id: 'id', name: 'Public name', specialty: 'Public specialty', photoUrl: null, phone: 'private', credentials: ['private'], registrationNumber: 'private' };
  assert.deepEqual(doctorAvailableEvent(row), { type: 'DOCTOR_AVAILABLE', doctor: { id: 'id', name: 'Public name', specialization: 'Public specialty', profileImage: null } });
});

test('connection registry heartbeat, session rechecks, capacity and cleanup are bounded', async () => {
  let valid = true;
  const principal = { userId: 'u', sessionId: 's', roles: ['USER'] as const };
  const clients = new PatientConnections({ async verify() { return valid ? principal : null; } });
  class Socket extends EventEmitter {
    readyState = 1; bufferedAmount = 0; terminated = false; pings = 0; sent: string[] = [];
    send(value: string, callback?: (e?: Error) => void) { this.sent.push(value); callback?.(); }
    ping() { this.pings++; }
    terminate() { this.terminated = true; this.readyState = 3; this.emit('close'); }
    close() { this.terminate(); }
  }
  const add = () => { const s = new Socket(); clients.add(s as unknown as WebSocket, 'token', principal); return s; };
  try {
    const first = add(); await clients.heartbeat(); assert.equal(first.pings, 1);
    first.emit('pong'); await clients.heartbeat(); assert.equal(first.pings, 2);
    await clients.heartbeat(); assert.equal(first.terminated, true); assert.equal(clients.size, 0);
    const revoked = add(); valid = false; await clients.heartbeat(); assert.equal(revoked.terminated, true);
    valid = true; const sockets = [add(), add(), add()]; assert.equal(clients.hasCapacity('u'), false);
    assert.equal(add().terminated, true); clients.disconnectToken('token'); assert.equal(clients.size, 0);
    assert.ok(sockets.every(s => s.terminated));
    const malicious = add(); malicious.emit('message', '{"role":"ADMIN"}'); assert.equal(malicious.terminated, true);
    const slow = add(); slow.bufferedAmount = 65537;
    await clients.publish(doctorAvailableEvent({ id: 'id', name: 'name', specialty: 'specialty', photoUrl: null }));
    assert.equal(slow.terminated, true);
    const closing = add(); clients.close(); assert.equal(closing.terminated, true);
  } finally { clients.close(); }
});

test('real WebSocket and PostgreSQL Doctor lifecycle preserve Patient authorization', {
  skip: process.env.AUTH_INTEGRATION !== 'true' || !process.env.DATABASE_URL,
}, async t => {
  const database = createDatabase(process.env.DATABASE_URL!), db = database.client!;
  const env = readEnvironment({ APP_ENV: 'test', OTP_MODE: 'development', SESSION_SECRET: randomBytes(32).toString('hex'), ADMIN_SECURITY_MODE: 'development', CORS_ORIGINS: 'https://patient.example.test' });
  const app = await buildApp(env, database, { deferDocuments: true });
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const url = address.replace('http:', 'ws:') + '/api/v1/realtime/patient';
  const users: string[] = [], sockets: WebSocket[] = [];
  async function account(role: 'USER' | 'DOCTOR' | 'ADMIN') {
    const user = await db.user.create({ data: { roles: { create: { role } } } }); users.push(user.id);
    const token = randomBytes(32).toString('base64url');
    const session = await db.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000) } });
    return { id: user.id, token, sessionId: session.id };
  }
  let sequence = 0;
  const call = (path: string, token: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: object) => app.inject({ method, url: '/api/v1' + path, remoteAddress: `127.66.0.${++sequence}`, headers: { authorization: 'Bearer ' + token }, ...(body ? { payload: body } : {}) });
  const protocols = (token: string) => ['pocket-doctor.v1', 'session.' + token];
  async function open(token: string) {
    const socket = new WebSocket(url, protocols(token)); sockets.push(socket);
    const frames: { type: string; doctor?: Record<string, unknown> }[] = [];
    socket.on('error', () => {}); socket.on('message', data => frames.push(JSON.parse(data.toString())));
    await waitFor(() => frames.some(frame => frame.type === 'READY'));
    assert.equal(socket.protocol, 'pocket-doctor.v1');
    return { socket, frames, events: () => frames.filter(frame => frame.type === 'DOCTOR_AVAILABLE') };
  }
  async function denied(token: string | undefined, status: number, suffix = '', origin?: string) {
    await new Promise<void>((resolve, reject) => {
      const s = new WebSocket(url + suffix, token ? protocols(token) : [], { handshakeTimeout: 3000, ...(origin ? { origin } : {}) });
      s.on('error', () => {}); s.on('open', () => { s.terminate(); reject(new Error('Unauthorized upgrade accepted')); });
      s.on('unexpected-response', (_r, response) => { response.resume(); s.terminate(); try { assert.equal(response.statusCode, status); resolve(); } catch (e) { reject(e); } });
    });
  }
  t.after(async () => {
    sockets.forEach(s => s.terminate());
    await db.doctor.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });
  const patient = await account('USER'), doctor = await account('DOCTOR'), admin = await account('ADMIN');
  const profile = { name: 'SYNTHETIC realtime Doctor', qualification: 'Synthetic qualification', specialty: 'Synthetic specialty', biography: 'Synthetic profile for realtime integration tests.', registrationEmail: 'synthetic@example.invalid', registrationDateOfBirth: '', registrationGender: '', registrationAuthority: 'Synthetic council', registrationNumber: 'PRIVATE-TEST', experienceYears: 3, languages: ['English'], feePaise: 0 };
  const d = await db.doctor.create({ data: { ...profile, userId: doctor.id, registrationStartedAt: new Date() } });
  const review = '/admin/operations/doctors/' + d.id + '/registration/review';
  const availability = { timezone: 'Asia/Kolkata', consultationMinutes: 30, bufferMinutes: 0, acceptingAppointments: true, windows: [{ weekday: 1, startMinute: 540, endMinute: 1020 }], excludedDates: [] };
  let connected: Awaited<ReturnType<typeof open>>;
  await t.test('unauthenticated, invalid, expired, privileged, mixed-role and foreign-origin clients are rejected', async () => {
    await denied(undefined, 401); await denied(randomBytes(32).toString('base64url'), 401);
    await denied(doctor.token, 403); await denied(admin.token, 403);
    await denied(patient.token, 400, '?role=ADMIN'); await denied(patient.token, 403, '', 'https://foreign.example.test');
    const mixed = await account('USER'); await db.userRole.create({ data: { userId: mixed.id, role: 'ADMIN' } }); await denied(mixed.token, 403);
    const expired = await account('USER'); await db.session.update({ where: { id: expired.sessionId }, data: { expiresAt: new Date(0) } }); await denied(expired.token, 401);
  });
  await t.test('Patient connects; draft/submission and approval without acceptance do not announce a public Doctor', async () => {
    connected = await open(patient.token);
    assert.equal((await call('/doctor/registration/submit', doctor.token, 'POST', {})).statusCode, 200);
    assert.equal((await call('/doctor/availability', doctor.token, 'POST', availability)).statusCode, 403);
    assert.equal((await call(review, admin.token, 'POST', { action: 'BEGIN_REVIEW' })).statusCode, 200);
    assert.equal((await call(review, admin.token, 'POST', { action: 'REJECT', reason: 'Correct synthetic details' })).statusCode, 200);
    assert.equal(connected.events().length, 0);
    assert.equal((await call('/doctor/registration', doctor.token, 'PATCH', profile)).statusCode, 200);
    assert.equal((await call('/doctor/registration/submit', doctor.token, 'POST', {})).statusCode, 200);
    assert.equal((await call(review, admin.token, 'POST', { action: 'APPROVE' })).statusCode, 200);
    assert.equal((await call('/doctors/' + d.id, patient.token)).statusCode, 404);
    assert.equal(connected.events().length, 0);
  });
  await t.test('first public availability publishes one private-data-free event; concurrent saves and repeated approval do not duplicate it', async () => {
    const results = await Promise.all([call('/doctor/availability', doctor.token, 'POST', availability), call('/doctor/availability', doctor.token, 'POST', availability)]);
    assert.ok(results.every(r => r.statusCode === 200));
    await waitFor(() => connected.events().length === 1);
    assert.deepEqual(connected.events()[0], { type: 'DOCTOR_AVAILABLE', doctor: { id: d.id, name: profile.name, specialization: profile.specialty, profileImage: null } });
    assert.equal((await call('/doctors/' + d.id, patient.token)).statusCode, 200);
    assert.equal((await call(review, admin.token, 'POST', { action: 'APPROVE' })).statusCode, 409);
    assert.equal((await call('/doctor/profile', doctor.token, 'PATCH', { biography: 'Changed public biography', languages: ['English'] })).statusCode, 200);
    assert.equal(connected.events().length, 1);
  });
  await t.test('logout closes existing socket; reconnect receives READY without replaying stored events', async () => {
    connected.socket.close(); await waitFor(() => connected.socket.readyState === WebSocket.CLOSED);
    connected = await open(patient.token); assert.equal(connected.events().length, 0);
    assert.equal((await call('/auth/logout', patient.token, 'POST')).statusCode, 200);
    await waitFor(() => connected.socket.readyState === WebSocket.CLOSED); await denied(patient.token, 401);
  });
  await t.test('suspended/deactivated Patient sessions are rechecked before any event and receive no broadcast', async () => {
    for (const accountStatus of ['SUSPENDED', 'DEACTIVATED'] as const) {
      const user = await account('USER'), c = await open(user.token);
      await db.user.update({ where: { id: user.id }, data: { accountStatus } });
      await call('/doctor/availability', doctor.token, 'POST', { ...availability, acceptingAppointments: false });
      await call('/doctor/availability', doctor.token, 'POST', availability);
      await waitFor(() => c.socket.readyState === WebSocket.CLOSED); assert.equal(c.events().length, 0);
      await denied(user.token, 401);
    }
  });
  await t.test('suspended Doctor cannot publish via availability; backend review remains authoritative', async () => {
    assert.equal((await call(review, admin.token, 'POST', { action: 'SUSPEND' })).statusCode, 200);
    assert.equal((await call('/doctor/availability', doctor.token, 'POST', availability)).statusCode, 403);
  });
  await t.test('approval publishes once when its locked transition also satisfies existing public visibility', async () => {
    const p = await account('USER'), c = await open(p.token), owner = await account('DOCTOR');
    const pending = await db.doctor.create({ data: { ...profile, userId: owner.id, registrationStartedAt: new Date(), registrationSubmittedAt: new Date(), acceptingAppointments: true } });
    const path = '/admin/operations/doctors/' + pending.id + '/registration/review';
    const results = await Promise.all([call(path, admin.token, 'POST', { action: 'APPROVE' }), call(path, admin.token, 'POST', { action: 'APPROVE' })]);
    assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
    await waitFor(() => c.events().length === 1);
    assert.equal(c.events()[0]!.doctor!.id, pending.id);
    assert.equal((await call('/doctors/' + pending.id, p.token)).statusCode, 200);
  });
});
