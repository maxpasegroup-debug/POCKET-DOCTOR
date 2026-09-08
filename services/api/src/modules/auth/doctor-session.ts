import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { authenticate, authorize } from './authorization.js';
import { IdentityService } from './identity-service.js';
import { ConsultationService } from '../consultations/consultation-service.js';

const deployed = (env: Environment) => env.APP_ENV === 'production' || env.APP_ENV === 'staging';
export const doctorCookieName = (env: Environment) => deployed(env) ? '__Secure-pd_doctor_session' : 'pd_doctor_session';

function checkOrigin(request: FastifyRequest, env: Environment) {
  const origin = request.headers.origin;
  const allowed = env.CORS_ORIGINS.split(',').map(value => value.trim()).filter(Boolean);
  if ((!origin && request.headers['sec-fetch-site'] === 'same-origin') || (origin && allowed.includes(origin))) return;
  throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Open the configured Doctor Portal to continue.');
}

function cookieToken(request: FastifyRequest, env: Environment) {
  const values = (request.headers.cookie ?? '').split(';').map(value => value.trim())
    .filter(value => value.startsWith(`${doctorCookieName(env)}=`));
  const token = values.length === 1 ? values[0]!.slice(doctorCookieName(env).length + 1) : '';
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : '';
}

function cookie(reply: FastifyReply, env: Environment, token: string, seconds: number) {
  reply.header('set-cookie', `${doctorCookieName(env)}=${token}; Path=/api/v1/doctor; HttpOnly; SameSite=Strict; Max-Age=${seconds}${deployed(env) ? '; Secure' : ''}`);
}

// This is another transport for the existing opaque Session, not another identity system.
export async function authenticateDoctor(request: FastifyRequest, identity: IdentityService, env: Environment) {
  if (request.headers.authorization) return authenticate(request, identity);
  const token = cookieToken(request, env);
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
  checkOrigin(request, env);
  const principal = await identity.verify(token);
  if (!principal) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
  return principal;
}

export function registerDoctorSessionRoutes(app: FastifyInstance, env: Environment, db?: PrismaClient) {
  const identity = db ? new IdentityService(db, env) : undefined;
  async function principal(request: FastifyRequest) {
    if (!identity || !db) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Sign-in is temporarily unavailable.');
    const actor = await authenticateDoctor(request, identity, env);
    authorize(actor, ['DOCTOR']);
    return actor;
  }
  app.post('/api/v1/doctor/session', async (request, reply) => {
    if (!identity || !db) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Sign-in is temporarily unavailable.');
    checkOrigin(request, env);
    const actor = await authenticate(request, identity);
    authorize(actor, ['DOCTOR']);
    const session = await db.session.findUniqueOrThrow({ where: { id: actor.sessionId } });
    cookie(reply, env, request.headers.authorization!.slice(7), Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)));
    return { data: { established: true } };
  });
  app.get('/api/v1/doctor/session', async request => {
    const actor = await principal(request);
    const profile = await db!.doctor.findUnique({ where: { userId: actor.userId } });
    const status = !profile ? 'PROFILE_REQUIRED'
      : profile.verificationStatus !== 'VERIFIED' ? profile.verificationStatus
      : !profile.name.trim() || !profile.qualification.trim() || !profile.specialty.trim() || !profile.biography.trim() || profile.languages.length === 0 ? 'PROFILE_REQUIRED'
      : profile.isDemo && env.DEMO_CONSULTATIONS !== 'true' ? 'UNAVAILABLE' : 'READY';
    return { data: { status, doctor: status === 'READY' ? await new ConsultationService(db!, env).profile(actor.userId) : null } };
  });
  app.delete('/api/v1/doctor/session', async (request, reply) => {
    checkOrigin(request, env);
    cookie(reply, env, '', 0);
    if (identity) {
      const token = cookieToken(request, env);
      const actor = token ? await identity.verify(token) : null;
      if (actor) await identity.logout(actor);
    }
    return { data: { loggedOut: true } };
  });
}
