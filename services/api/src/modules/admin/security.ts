import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { authenticate, authorize } from '../auth/authorization.js';
import { IdentityService } from '../auth/identity-service.js';
import type { Principal } from '../auth/contracts.js';

// RFC 6238: SHA-1, 30 seconds, six digits. Provision per-admin keys out of band.
export function totp(secret: string, counter: bigint, digits = 6) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '';
  for (const ch of secret) { const n = alphabet.indexOf(ch); if (n < 0) throw new Error('Invalid MFA key'); bits += n.toString(2).padStart(5, '0'); }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map(byte => parseInt(byte, 2)));
  const value = Buffer.alloc(8); value.writeBigUInt64BE(counter);
  const hash = createHmac('sha1', key).update(value).digest(); const offset = hash[19]! & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).toString().padStart(digits, '0');
}
const actors = new WeakMap<FastifyRequest, Principal>();
export function adminActor(request: FastifyRequest) {
  const actor = actors.get(request);
  if (!actor) throw new ApiError(403, 'FORBIDDEN', 'Access denied.');
  return actor;
}
export function registerAdminSecurity(app: FastifyInstance, env: Environment, db?: PrismaClient) {
  const identity = db ? new IdentityService(db, env) : undefined;
  const elevated = async (principal: Principal) => env.ADMIN_SECURITY_MODE === 'development' ||
    !!await db!.adminElevation.findFirst({ where: { sessionId: principal.sessionId, userId: principal.userId, expiresAt: { gt: new Date() } } });
  app.addHook('onRequest', async r => {
    if (!r.routeOptions.url?.startsWith('/api/v1/admin/')) return;
    if (!db || !identity) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Administration is unavailable.');
    const principal = await authenticate(r, identity); actors.set(r, principal);
    await db.adminAuditEvent.create({ data: { actorId: principal.userId, action: `${r.method} ${r.routeOptions.url}`,
      resourceId: z.object({ id: z.string().uuid() }).safeParse(r.params).data?.id ?? null, requestId: r.id, result: 'ATTEMPTED' } });
    authorize(principal, ['ADMIN']);
    if (env.ADMIN_SECURITY_MODE === 'disabled') throw new ApiError(503, 'ADMIN_DISABLED', 'Administration is disabled.');
    if (r.routeOptions.url.startsWith('/api/v1/admin/session/')) return;
    if (!await elevated(principal)) throw new ApiError(403, 'ADMIN_STEP_UP_REQUIRED', 'Verify your administrator session.');
  });
  app.addHook('onSend', async (r, reply, payload) => {
    const actor = actors.get(r);
    if (actor && db) await db.adminAuditEvent.create({ data: { actorId: actor.userId, action: `${r.method} ${r.routeOptions.url}`,
      requestId: r.id, result: reply.statusCode < 400 ? 'SUCCEEDED' : 'DENIED_OR_FAILED' } });
    return payload;
  });
  app.get('/api/v1/admin/session/status', async r => ({ data: { mode: env.ADMIN_SECURITY_MODE, elevated: await elevated(adminActor(r)) } }));
  app.post('/api/v1/admin/session/elevate', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async r => {
    const actor = adminActor(r); const input = z.object({ code: z.string().regex(/^\d{6}$/).optional() }).strict().safeParse(r.body);
    if (!input.success) throw new ApiError(400, 'INVALID_REQUEST', 'Enter the six-digit verification code.');
    const expiresAt = new Date(Date.now() + 15 * 60000);
    const accepted = await db!.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.userId}, 707))::text`;
      if (env.ADMIN_SECURITY_MODE === 'totp') {
        const keys = JSON.parse(env.ADMIN_TOTP_KEYS) as Record<string, string>; const secret = keys[actor.userId];
        const now = BigInt(Math.floor(Date.now() / 30000));
        const previous = await tx.adminMfaCounter.findUnique({ where: { userId: actor.userId } });
        const sameWindow = previous && Date.now() - previous.windowStartedAt.getTime() < 15 * 60000;
        if (sameWindow && previous.failedAttempts >= 5) return false;
        const counter = secret && input.data.code ? [now - 1n, now, now + 1n].find(c => c > (previous?.counter ?? -1n) && timingSafeEqual(Buffer.from(totp(secret, c)), Buffer.from(input.data.code!))) : undefined;
        if (counter === undefined) {
          await tx.adminMfaCounter.upsert({ where: { userId: actor.userId }, create: { userId: actor.userId, counter: -1n, failedAttempts: 1 },
            update: { failedAttempts: sameWindow ? previous.failedAttempts + 1 : 1, windowStartedAt: sameWindow ? previous.windowStartedAt : new Date() } });
          return false; // Commit failure counters even when verification fails.
        }
        await tx.adminMfaCounter.upsert({ where: { userId: actor.userId }, create: { userId: actor.userId, counter }, update: { counter, failedAttempts: 0 } });
      }
      await tx.adminElevation.upsert({ where: { sessionId: actor.sessionId }, create: { sessionId: actor.sessionId, userId: actor.userId, expiresAt }, update: { expiresAt } });
      return true;
    });
    if (!accepted) throw new ApiError(403, 'MFA_INVALID', 'Verification failed. Wait before trying another code.');
    return { data: { elevated: true, expiresAt } };
  });
}
