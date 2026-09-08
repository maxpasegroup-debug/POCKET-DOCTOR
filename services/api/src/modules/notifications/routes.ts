import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { authenticate } from '../auth/authorization.js';
import { IdentityService } from '../auth/identity-service.js';
import { parse } from '../admin/contracts.js';
import { notificationText } from './service.js';
export function registerNotificationRoutes(app: FastifyInstance, env: Environment, db?: PrismaClient) {
  const identity = db ? new IdentityService(db, env) : undefined;
  async function actor(r: FastifyRequest) { if (!identity) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Notifications are unavailable.'); return (await authenticate(r, identity)).userId; }
  app.get('/api/v1/me/notifications', async r => {
    const userId = await actor(r); const { page } = parse(z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).strict(), r.query);
    const items = await db!.notification.findMany({ where: { userId, channel: 'IN_APP' }, select: { id: true, kind: true, route: true, readAt: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 21, skip: (page - 1) * 20 });
    return { data: { items: items.slice(0, 20).map(n => ({ ...n, text: notificationText[n.kind] ?? 'There is an account update.' })), page, hasMore: items.length > 20 } };
  });
  app.post('/api/v1/me/notifications/:id/read', async r => {
    const userId = await actor(r), { id } = parse(z.object({ id: z.string().uuid() }), r.params); parse(z.object({}).strict(), r.body ?? {});
    const result = await db!.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
    if (!result.count) throw new ApiError(404, 'NOT_FOUND', 'Notification not found.'); return { data: { saved: true } };
  });
}
