import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { IdentityService } from './identity-service.js';
import { ApiError } from '../../errors/api-error.js';
export function requestBudgetScope(method: string, route: string) {
  if (!['POST', 'PATCH', 'DELETE'].includes(method)) return null;
  if (/\/admin\//.test(route)) return { scope: 'admin', max: 60 };
  if (/\/integrations\/whatsapp\/(link|confirm)$/.test(route)) return { scope: 'whatsapp-link', max: 6 };
  if (/consultations\/(book|[^/]+\/reschedule)$/.test(route)) return { scope: 'booking', max: 20 };
  // Quote, order, verification and retry all consume this shared burst budget.
  if (/payment|checkout|coupon|subscribe|\/orders$|\/enroll$/.test(route)) return { scope: 'payment', max: 60 };
  return null;
}
export function registerRequestBudgets(app: FastifyInstance, env: Environment, db?: PrismaClient, now: () => number = Date.now) {
  if (!db) return;
  const identity = new IdentityService(db, env);
  app.addHook('onRequest', async r => {
    const budget = requestBudgetScope(r.method, r.routeOptions.url ?? ''); if (!budget) return;
    const token = /^Bearer ([^\s]+)$/.exec(r.headers.authorization ?? '')?.[1]; if (!token) return;
    const principal = await identity.verify(token); if (!principal) return;
    const minute = Math.floor(now() / 60000);
    const key = createHash('sha256').update(`${principal.userId}:${budget.scope}:${minute}`).digest('hex');
    const rows = await db.$queryRaw<{ count: number }[]>`INSERT INTO "RequestBudget" ("key","count","expiresAt") VALUES (${key},1,${new Date((minute + 2) * 60000)})
      ON CONFLICT ("key") DO UPDATE SET "count"="RequestBudget"."count"+1 WHERE "RequestBudget"."count"<${budget.max} RETURNING "count"`;
    if (!rows.length) throw new ApiError(429, 'RATE_LIMITED', 'Please wait a moment before trying again.');
  });
}
