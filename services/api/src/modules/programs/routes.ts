import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { authenticate } from '../auth/authorization.js';
import { IdentityService } from '../auth/identity-service.js';
import { ProgramService } from './program-service.js';

const id = z.string().uuid();
const programParams = z.object({ id });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'INVALID_REQUEST', 'Please check your request and try again.');
  return result.data;
}
export function registerProgramRoutes(app: FastifyInstance, env: Environment, db?: PrismaClient) {
  const programs = db ? new ProgramService(db, env) : undefined;
  const identity = db ? new IdentityService(db, env) : undefined;
  const context = async (request: FastifyRequest) => {
    if (!programs || !identity) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Programs are unavailable right now.');
    return { programs, userId: (await authenticate(request, identity)).userId };
  };
  app.get('/api/v1/programs/categories', async request => ({ data: { categories: await (await context(request)).programs.categories() } }));
  for (const route of ['/api/v1/programs', '/api/v1/programs/featured']) {
    app.get(route, async request => {
      const { programs, userId } = await context(request);
      const query = parse(z.object({ q: z.string().trim().max(100).optional(), category: z.string().max(60).optional(),
        type: z.enum(['RECORDED', 'LIVE']).optional(), price: z.enum(['free', 'paid']).optional(),
        duration: z.enum(['short', 'long']).optional(), recommended: z.enum(['true', 'false']).optional(),
        page: z.coerce.number().int().min(1).max(1000).optional() }).strict(), request.query);
      return { data: await programs.discover(userId, { ...query, recommended: query.recommended === 'true', featured: route.endsWith('/featured') }) };
    });
  }
  app.get('/api/v1/programs/:id', async request => {
    const { programs, userId } = await context(request);
    return { data: { program: await programs.detail(userId, parse(programParams, request.params).id) } };
  });
  app.get('/api/v1/me/programs', async request => {
    const { programs, userId } = await context(request);
    return { data: { programs: await programs.mine(userId) } };
  });
  for (const path of ['/api/v1/me/programs/:id', '/api/v1/me/programs/:id/progress']) {
    app.get(path, async request => {
      const { programs, userId } = await context(request);
      return { data: await programs.overview(userId, parse(programParams, request.params).id) };
    });
  }
  app.post('/api/v1/programs/:id/enroll', async request => {
    const { programs, userId } = await context(request);
    parse(z.object({}).strict(), request.body ?? {});
    return { data: { enrollment: await programs.enroll(userId, parse(programParams, request.params).id) } };
  });
  app.post('/api/v1/programs/:id/payment', async request => {
    const { programs, userId } = await context(request);
    parse(z.object({}).strict(), request.body ?? {});
    const payment = await programs.payment(userId, parse(programParams, request.params).id);
    return { data: { payment: { id: payment.id, amountPaise: payment.amountPaise, currency: payment.currency, mode: payment.provider } } };
  });
  app.post('/api/v1/program-payments/:id/development-settle', async request => {
    const { programs, userId } = await context(request);
    const body = parse(z.object({ outcome: z.enum(['capture', 'fail']) }).strict(), request.body);
    return { data: await programs.settleDevelopment(userId, parse(programParams, request.params).id, body.outcome) };
  });
  app.get('/api/v1/me/programs/:id/lessons/:lessonId', async request => {
    const { programs, userId } = await context(request);
    const params = parse(z.object({ id, lessonId: id }), request.params);
    return { data: { lesson: await programs.lesson(userId, params.id, params.lessonId) } };
  });
  app.post('/api/v1/me/programs/:id/lessons/:lessonId/progress', async request => {
    const { programs, userId } = await context(request);
    const params = parse(z.object({ id, lessonId: id }), request.params);
    const body = parse(z.object({ positionSeconds: z.number().int().min(0).max(86400), completed: z.boolean() }).strict(), request.body);
    return { data: await programs.progress(userId, params.id, params.lessonId, body) };
  });
}
