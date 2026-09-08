import { randomUUID } from 'node:crypto';
import Fastify, { LogController } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Environment } from './config/env.js';
import type { Database } from './database/database.js';
import { ApiError } from './errors/api-error.js';
import { registerIdentityRoutes } from './modules/auth/routes.js';
import { registerDoctorSessionRoutes } from './modules/auth/doctor-session.js';
import { registerProgramRoutes } from './modules/programs/routes.js';
import { registerConsultationRoutes } from './modules/consultations/routes.js';
import { registerCommerceRoutes } from './modules/wellness/routes.js';
import { registerAssistantRoutes } from './modules/assistant/routes.js';
import { registerMembershipRoutes } from './modules/membership/routes.js';
import { registerAdminSecurity } from './modules/admin/security.js';
import { registerAdminRoutes } from './modules/admin/routes.js';
import { registerPrivacyRoutes } from './modules/privacy/routes.js';
import { registerNotificationRoutes } from './modules/notifications/routes.js';
import { registerPushRoutes } from './modules/notifications/push.js';
import { registerPaymentWebhook } from './modules/payments/webhook.js';
import { registerRequestBudgets } from './modules/auth/request-budget.js';
import { ApiMetrics } from './observability.js';

export async function buildApp(env: Environment, database?: Database) {
  const metrics = new ApiMetrics();
  const app = Fastify({
    bodyLimit: 64 * 1024,
    requestTimeout: 10000,
    trustProxy: env.TRUSTED_PROXY_CIDRS.trim() ? env.TRUSTED_PROXY_CIDRS.split(',').map(v => v.trim()).filter(Boolean) : false,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    logController: new LogController({ disableRequestLogging: true }),
    logger: env.APP_ENV === 'test' ? false : {
      level: env.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie', 'password', 'token', 'phone', 'healthData'],
    },
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('cache-control', 'no-store');
  });
  app.addHook('onResponse', async (request, reply) => {
    metrics.record(request.method, request.routeOptions.url ?? 'unmatched', reply.statusCode, reply.elapsedTime);
    // Log only route patterns, never URLs, query strings, bodies or identities.
    request.log.info({ route: request.routeOptions.url ?? 'unmatched', method: request.method, statusCode: reply.statusCode }, 'request completed');
  });

  app.setErrorHandler((error, request, reply) => {
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    if (error instanceof ApiError) {
      status = error.statusCode; code = error.code; message = error.message;
    } else if (typeof error === 'object' && error !== null && 'statusCode' in error) {
      const candidate = Number(error.statusCode);
      if (candidate >= 400 && candidate < 500) {
        status = candidate;
        code = status === 429 ? 'RATE_LIMITED' : 'INVALID_REQUEST';
        message = status === 429 ? 'Please try again later.' : 'The request is invalid.';
      }
    }
    if (status >= 500) request.log.error({ code }, 'request failed');
    reply.status(status).send({ error: { code, message, requestId: request.id } });
  });
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.', requestId: request.id } });
  });

  registerRequestBudgets(app, env, database?.client);
  registerAdminSecurity(app, env, database?.client);
  registerAdminRoutes(app, env, database?.client);
  app.get('/api/v1/admin/operations/metrics', async () => ({ data: { items: metrics.snapshot(), scope: 'This API process since startup' } }));
  registerPrivacyRoutes(app, env, database?.client);
  registerNotificationRoutes(app, env, database?.client);
  registerPushRoutes(app, env, database?.client);
  registerPaymentWebhook(app, env, database?.client);
  registerIdentityRoutes(app, env, database?.client);
  registerDoctorSessionRoutes(app, env, database?.client);
  registerProgramRoutes(app, env, database?.client);
  registerConsultationRoutes(app, env, database?.client);
  registerCommerceRoutes(app, env, database?.client);
  registerAssistantRoutes(app, env, database?.client);
  registerMembershipRoutes(app, env, database?.client);

  app.get('/api/v1/health', { config: { rateLimit: false } }, async () => ({
    data: { status: 'ok', service: 'pocket-doctor-api', phase: 7 },
  }));
  app.get('/api/v1/health/ready', { config: { rateLimit: false } }, async () => {
    if (!database) throw new ApiError(503, 'NOT_READY', 'Service is not ready.');
    try { await database.ping(); }
    catch { throw new ApiError(503, 'NOT_READY', 'Service is not ready.'); }
    return { data: { status: 'ready' } };
  });
  app.addHook('onClose', async () => { await database?.close(); });
  return app;
}
