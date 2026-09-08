import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { authenticate, authorize } from '../auth/authorization.js';
import { IdentityService } from '../auth/identity-service.js';
import { authenticateDoctor } from '../auth/doctor-session.js';
import { ConsultationService } from './consultation-service.js';
import { availabilityInput, localDate } from './availability.js';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'INVALID_REQUEST', 'Please check your details and try again.');
  return result.data;
}
const idSchema = z.object({ id: z.string().uuid() });
const slotSchema = z.object({ date: localDate, startsAt: z.iso.datetime({ offset: true }) }).strict();
export function registerConsultationRoutes(app: FastifyInstance, env: Environment, db?: PrismaClient) {
  const service = db ? new ConsultationService(db, env) : undefined;
  const identity = db ? new IdentityService(db, env) : undefined;
  async function context(request: FastifyRequest, doctor = false) {
    if (!service || !identity) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Consultations are unavailable right now.');
    const principal = doctor ? await authenticateDoctor(request, identity, env) : await authenticate(request, identity);
    authorize(principal, doctor ? ['DOCTOR'] : ['USER']);
    return { service, userId: principal.userId };
  }
  const id = (request: FastifyRequest) => parse(idSchema, request.params).id;
  const empty = (request: FastifyRequest) => parse(z.object({}).strict(), request.body ?? {});
  app.get('/api/v1/doctors', async request => {
    const { service } = await context(request);
    const query = parse(z.object({ q: z.string().trim().max(100).optional(), specialty: z.string().max(100).optional(),
      featured: z.enum(['true', 'false']).optional(), page: z.coerce.number().int().min(1).max(1000).optional() }).strict(), request.query);
    return { data: await service.discover({ ...query, featured: query.featured === 'true' }) };
  });
  app.get('/api/v1/specialties', async request => ({ data: { specialties: await (await context(request)).service.specialties() } }));
  app.get('/api/v1/doctors/:id', async request => ({ data: { doctor: await (await context(request)).service.detail(id(request)) } }));
  app.get('/api/v1/doctors/:id/slots', async request => {
    const { service } = await context(request);
    return { data: await service.slots(id(request), parse(z.object({ date: localDate }).strict(), request.query).date) };
  });
  app.post('/api/v1/consultations/book', async request => {
    const { service, userId } = await context(request);
    const body = parse(slotSchema.extend({ doctorId: z.string().uuid() }).strict(), request.body);
    return { data: { consultation: await service.book(userId, body.doctorId, body.date, body.startsAt) } };
  });
  app.get('/api/v1/me/consultations', async request => {
    const { service, userId } = await context(request);
    return { data: { consultations: await service.mine(userId) } };
  });
  app.get('/api/v1/me/consultations/:id', async request => {
    const { service, userId } = await context(request);
    return { data: { consultation: await service.detailFor(userId, id(request)) } };
  });
  app.post('/api/v1/consultations/:id/payment', async request => {
    const { service, userId } = await context(request); empty(request);
    return { data: { payment: await service.payment(userId, id(request)) } };
  });
  app.post('/api/v1/consultation-payments/:id/development-settle', async request => {
    const { service, userId } = await context(request);
    const body = parse(z.object({ outcome: z.enum(['capture', 'fail']) }).strict(), request.body);
    return { data: { consultation: await service.settle(userId, id(request), body.outcome) } };
  });
  app.post('/api/v1/consultations/:id/cancel', async request => {
    const { service, userId } = await context(request); empty(request);
    return { data: { consultation: await service.cancel(userId, id(request)) } };
  });
  app.post('/api/v1/consultations/:id/reschedule', async request => {
    const { service, userId } = await context(request);
    const body = parse(slotSchema, request.body);
    return { data: { consultation: await service.reschedule(userId, id(request), body.date, body.startsAt) } };
  });
  app.get('/api/v1/doctor/appointments', async request => {
    const { service, userId } = await context(request, true);
    return { data: { consultations: await service.doctorAppointments(userId) } };
  });
  app.post('/api/v1/me/consultations/:id/access', async request => {
    const { service, userId } = await context(request); empty(request);
    return { data: await service.sessionAccess(userId, id(request), 'patient') };
  });
  app.post('/api/v1/doctor/consultations/:id/access', async request => {
    const { service, userId } = await context(request, true); empty(request);
    return { data: await service.sessionAccess(userId, id(request), 'doctor') };
  });
  app.get('/api/v1/doctor/availability', async request => {
    const { service, userId } = await context(request, true);
    return { data: await service.availability(userId) };
  });
  app.post('/api/v1/doctor/availability', async request => {
    const { service, userId } = await context(request, true);
    return { data: await service.updateAvailability(userId, parse(availabilityInput, request.body)) };
  });
  app.get('/api/v1/doctor/profile', async request => {
    const { service, userId } = await context(request, true);
    return { data: { doctor: await service.profile(userId) } };
  });
  app.patch('/api/v1/doctor/profile', async request => {
    const { service, userId } = await context(request, true);
    const body = parse(z.object({ biography: z.string().trim().min(1).max(2000), languages: z.array(z.string().trim().min(2).max(40).transform(v => v.toLowerCase())).min(1).max(10) }).strict(), request.body);
    return { data: { doctor: await service.profile(userId, body) } };
  });
  app.post('/api/v1/doctor/consultations/:id/notes', async request => {
    const { service, userId } = await context(request, true);
    const body = parse(z.object({ privateNote: z.string().max(10000), summary: z.string().max(5000), followUpRequired: z.boolean(),
      followUpDate: localDate.nullable(), followUpNote: z.string().max(2000) }).strict().refine(v => v.followUpRequired || (v.followUpDate === null && v.followUpNote === '')), request.body);
    return { data: await service.notes(userId, id(request), body) };
  });
  app.post('/api/v1/doctor/consultations/:id/action', async request => {
    const { service, userId } = await context(request, true);
    return { data: await service.transition(userId, id(request), parse(z.object({ action: z.enum(['start', 'complete', 'no-show']) }).strict(), request.body).action) };
  });
}
