import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { IdentityService } from '../auth/identity-service.js';
import type { Principal } from '../auth/contracts.js';
import { doctorAvailableEvent, publiclyAvailable, type PatientEventPublisher } from './events.js';
import { PatientConnections, patientOnly } from './patient-connections.js';

export function registerPatientRealtime(app: FastifyInstance, env: Environment, db?: PrismaClient): PatientEventPublisher {
  const identity = db ? new IdentityService(db, env) : { async verify() { return null; } };
  const clients = new PatientConnections(identity);
  let closing = false, queued = 0;
  let delivery = Promise.resolve();
  const authorized = new WeakMap<FastifyRequest, { token: string; principal: Principal }>();
  app.get('/api/v1/realtime/patient', { websocket: true, config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    preValidation: async request => {
      if (Object.keys(request.query as object).length) throw new ApiError(400, 'INVALID_REQUEST', 'Query parameters are not supported.');
      const origin = request.headers.origin;
      if (origin && !env.CORS_ORIGINS.split(',').map(s => s.trim()).includes(origin)) throw new ApiError(403, 'FORBIDDEN', 'Origin not allowed.');
      const protocols = request.headers['sec-websocket-protocol']?.split(',').map(s => s.trim()) ?? [];
      const session = protocols.find(p => /^session\.[A-Za-z0-9_-]{43}$/.test(p));
      if (protocols.length !== 2 || !protocols.includes('pocket-doctor.v1') || !session) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
      const token = session.slice('session.'.length), principal = await identity.verify(token);
      if (!principal) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
      if (!patientOnly(principal)) throw new ApiError(403, 'FORBIDDEN', 'Patient access required.');
      if (!clients.hasCapacity(principal.userId)) throw new ApiError(429, 'RATE_LIMITED', 'Connection limit reached.');
      authorized.set(request, { token, principal });
    },
  }, (socket, request) => {
    const context = authorized.get(request);
    if (!context) { socket.terminate(); return; }
    clients.add(socket, context.token, context.principal);
  });
  app.addHook('onResponse', async (request, reply) => {
    if (request.routeOptions.url === '/api/v1/auth/logout' && reply.statusCode < 400) {
      const token = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')?.[1];
      if (token) clients.disconnectToken(token);
    }
  });
  app.addHook('preClose', async () => { closing = true; clients.close(); });
  return { async doctorAvailable(id) {
    if (closing || !clients.size) return;
    // Ephemeral bounded work, not a durable queue. Approval never waits for a
    // slow recipient. Offline/overloaded clients recover through REST.
    if (queued >= 64) { app.log.warn({ code: 'REALTIME_OVERLOADED' }, 'Patient realtime event dropped'); return; }
    queued++;
    delivery = delivery.then(async () => {
      if (closing) return;
      const doctor = await db?.doctor.findUnique({ where: { id } });
      if (!closing && doctor && publiclyAvailable(doctor)) await clients.publish(doctorAvailableEvent(doctor));
    }).catch(() => { app.log.warn({ code: 'REALTIME_DELIVERY_FAILED' }, 'Patient realtime delivery failed'); })
      .finally(() => { queued--; });
  } };
}
