import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { authenticate } from '../auth/authorization.js';
import { IdentityService } from '../auth/identity-service.js';
import { FcmPushProvider, type NotificationChannelProvider } from './channel-providers.js';

export function encryptPushToken(token: string, secret: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(secret, 'base64'), iv);
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}
export function decryptPushToken(value: string, secret: string) {
  const data = Buffer.from(value, 'base64'), cipher = createDecipheriv('aes-256-gcm', Buffer.from(secret, 'base64'), data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8');
}
export function registerPushRoutes(app: FastifyInstance, env: Environment, db?: PrismaClient) {
  const identity = db ? new IdentityService(db, env) : undefined;
  app.post('/api/v1/me/push-device', async request => {
    if (!db || !identity || env.PUSH_PROVIDER === 'disabled') throw new ApiError(503, 'PUSH_UNAVAILABLE', 'Push notifications are not configured.');
    const actor = await authenticate(request, identity);
    const input = z.object({ token: z.string().regex(/^[A-Za-z0-9_:.-]{20,4096}$/), platform: z.enum(['android', 'ios', 'web']), enabled: z.boolean() }).strict().safeParse(request.body);
    if (!input.success) throw new ApiError(400, 'INVALID_DEVICE', 'Please check the notification registration.');
    const tokenHash = createHash('sha256').update(input.data.token).digest('hex');
    const data = { userId: actor.userId, sessionId: actor.sessionId, tokenHash, tokenEncrypted: encryptPushToken(input.data.token, env.NOTIFICATION_ENCRYPTION_KEY), platform: input.data.platform, enabled: input.data.enabled };
    try {
      const device = await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "Session" WHERE "id"=${actor.sessionId}::uuid FOR UPDATE`;
        const registered = await tx.pushDevice.upsert({ where: { sessionId: actor.sessionId }, create: data, update: data });
        await tx.consentRecord.create({ data: { userId: actor.userId, type: 'PUSH', version: '1', granted: data.enabled } });
        if (!data.enabled) await tx.notification.updateMany({ where: { pushDeviceId: registered.id, status: { in: ['PENDING', 'FAILED'] } }, data: { status: 'CANCELLED' } });
        return registered;
      });
      return { data: { id: device.id, enabled: device.enabled, platform: device.platform } };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ApiError(409, 'DEVICE_CONFLICT', 'Sign out of the previous account on this device before enabling notifications.');
      throw error;
    }
  });
  app.delete('/api/v1/me/push-device', async request => {
    if (!db || !identity) throw new ApiError(503, 'PUSH_UNAVAILABLE', 'Push notifications are unavailable.');
    const actor = await authenticate(request, identity);
    await db.$transaction(async tx => {
      await tx.pushDevice.deleteMany({ where: { sessionId: actor.sessionId, userId: actor.userId } });
      await tx.consentRecord.create({ data: { userId: actor.userId, type: 'PUSH', version: '1', granted: false } });
    });
    return { data: { removed: true } };
  });
}

export async function deliverPush(db: PrismaClient, env: Environment, provider: NotificationChannelProvider = new FcmPushProvider(env)) {
  if (env.PUSH_PROVIDER === 'disabled') return { attempted: 0 };
  const sources = await db.$queryRaw<{ id: string; userId: string; deviceId: string; kind: string; route: string }[]>`SELECT n."id", n."userId", d."id" AS "deviceId", n."kind", n."route" FROM "Notification" n
    JOIN "PushDevice" d ON d."userId"=n."userId" JOIN "User" u ON u."id"=n."userId" JOIN "Session" s ON s."id"=d."sessionId"
    WHERE n."channel"='IN_APP' AND n."createdAt">now()-interval '1 hour' AND n."createdAt">=d."updatedAt" AND d."enabled"=true AND u."notifications"=true AND u."accountStatus"='ACTIVE' AND s."expiresAt">now()
    AND NOT EXISTS (SELECT 1 FROM "Notification" p WHERE p."sourceKey"='push:' || n."id"::text || ':' || d."id"::text) ORDER BY n."createdAt" LIMIT 50`;
  for (const n of sources) await db.notification.upsert({ where: { sourceKey: `push:${n.id}:${n.deviceId}` }, create: {
    userId: n.userId, sourceKey: `push:${n.id}:${n.deviceId}`, kind: n.kind, route: n.route, pushDeviceId: n.deviceId, channel: 'PUSH', status: 'PENDING' }, update: {} });
  await db.notification.updateMany({ where: { channel: 'PUSH', status: 'SENDING', nextAttemptAt: { lt: new Date() } }, data: { status: 'UNKNOWN', lastError: 'WORKER_INTERRUPTED' } });
  let attempted = 0;
  for (let i = 0; i < 20; i++) {
    const next = await db.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Notification" WHERE "channel"='PUSH' AND "status" IN ('PENDING','FAILED') AND "providerReference" IS NULL AND "attempts"<3 AND "nextAttemptAt"<=now() ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
      return rows[0] ? tx.notification.update({ where: { id: rows[0].id }, data: { status: 'SENDING', attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 60000) } }) : null;
    });
    if (!next) break;
    const device = next.pushDeviceId ? await db.pushDevice.findUnique({ where: { id: next.pushDeviceId }, include: { user: true, session: true } }) : null;
    if (!device || !device.enabled || !device.user.notifications || device.user.accountStatus !== 'ACTIVE' || device.session.expiresAt <= new Date()) {
      await db.notification.update({ where: { id: next.id }, data: { status: 'CANCELLED' } }); continue;
    }
    let result;
    try { result = await provider.send({ destination: decryptPushToken(device.tokenEncrypted, env.NOTIFICATION_ENCRYPTION_KEY), eventId: next.id }); }
    catch { result = { status: 'UNKNOWN' as const, reason: 'DELIVERY_UNCONFIRMED' }; }
    await db.notification.update({ where: { id: next.id }, data: result.status === 'SENT' ? { status: 'SENT', providerReference: result.reference, lastError: null } : {
      status: result.status === 'FAILED' ? next.attempts >= 3 ? 'DEAD_LETTER' : 'FAILED' : result.status === 'INVALID_DESTINATION' ? 'CANCELLED' : result.status,
      lastError: result.reason, nextAttemptAt: new Date(Date.now() + 60000 * 2 ** next.attempts) } });
    if (result.status === 'INVALID_DESTINATION') await db.pushDevice.deleteMany({ where: { id: device.id, tokenHash: device.tokenHash } });
    attempted++;
  }
  return { attempted };
}
