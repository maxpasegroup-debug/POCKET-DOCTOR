import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { authenticate, authorize } from '../auth/authorization.js';
import { IdentityService } from '../auth/identity-service.js';
import { parse } from '../admin/contracts.js';
import { appointmentSelect, orderSelect, subscriptionSelect } from '../admin/queries.js';

export const consentInput = z.object({ type: z.enum(['TERMS', 'PRIVACY', 'COMMUNICATION', 'WHATSAPP', 'MARKETING', 'AI']),
  version: z.string().min(1).max(40), granted: z.boolean() }).strict();
export function registerPrivacyRoutes(app: FastifyInstance, env: Environment, db?: PrismaClient) {
  const identity = db ? new IdentityService(db, env) : undefined;
  async function actor(r: FastifyRequest) {
    if (!db || !identity) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Account controls are unavailable.');
    const principal = await authenticate(r, identity); authorize(principal, ['USER']); return principal;
  }
  const policies = () => JSON.parse(env.LEGAL_DOCUMENTS) as { type: string; version: string; url: string; approved: boolean }[];
  app.get('/api/v1/legal/documents', async () => ({ data: { items: policies(), notice: 'Only documents marked approved may be accepted. Missing documents require business and legal review.' } }));
  app.get('/api/v1/me/privacy', async r => {
    const a = await actor(r);
    const [records, requests] = await Promise.all([
      db!.consentRecord.findMany({ where: { userId: a.userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], distinct: ['type'], take: 6, select: { type: true, version: true, granted: true, createdAt: true } }),
      db!.privacyRequest.findMany({ where: { userId: a.userId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, type: true, status: true, createdAt: true } }),
    ]);
    return { data: { consents: records, requests, policies: policies(), accessDeletionNotice: 'Requesting deletion ends account access immediately. Financial and other retained records require a separate privacy review under the approved retention policy.' } };
  });
  app.post('/api/v1/me/consents', async r => {
    const a = await actor(r), input = parse(consentInput, r.body);
    const document = policies().find(p => p.type === input.type);
    if (input.granted && (['TERMS', 'PRIVACY'].includes(input.type) ? !document?.approved || document.version !== input.version : input.version !== (document?.version ?? '1'))) throw new ApiError(409, 'POLICY_UNAVAILABLE', 'The current policy is not available for acceptance.');
    await db!.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${a.userId}::uuid FOR UPDATE`;
      await tx.consentRecord.create({ data: { userId: a.userId, ...input } });
      if (input.type === 'COMMUNICATION') await tx.user.update({ where: { id: a.userId }, data: { notifications: input.granted } });
      if (input.type === 'AI') await tx.aIPreferences.upsert({ where: { userId: a.userId }, create: { userId: a.userId, providerConsent: input.granted }, update: { providerConsent: input.granted } });
      if (input.type === 'WHATSAPP' && !input.granted) {
        await tx.whatsAppIdentity.deleteMany({ where: { userId: a.userId } }); await tx.whatsAppLinkToken.deleteMany({ where: { userId: a.userId } });
        await tx.aIPreferences.updateMany({ where: { userId: a.userId }, data: { whatsappReminders: false } });
      }
      if (!input.granted && ['COMMUNICATION', 'WHATSAPP'].includes(input.type)) await tx.notification.updateMany({ where: { userId: a.userId, channel: { not: 'IN_APP' }, status: { in: ['PENDING', 'FAILED'] } }, data: { status: 'CANCELLED' } });
    }); return { data: { saved: true } };
  });
  app.post('/api/v1/me/privacy/deletion', { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } }, async r => {
    const a = await actor(r); parse(z.object({ confirmation: z.literal('DELETE MY ACCOUNT') }).strict(), r.body);
    const request = await db!.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(5055)`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${a.userId}::uuid FOR UPDATE`;
      const request = await tx.privacyRequest.create({ data: { userId: a.userId, type: 'ACCESS_DELETION' } });
      await tx.user.update({ where: { id: a.userId }, data: { accountStatus: 'DELETION_REQUESTED', notifications: false } });
      await tx.session.deleteMany({ where: { userId: a.userId } }); await tx.adminElevation.deleteMany({ where: { userId: a.userId } });
      await tx.whatsAppIdentity.deleteMany({ where: { userId: a.userId } }); await tx.whatsAppLinkToken.deleteMany({ where: { userId: a.userId } });
      await tx.aIPreferences.updateMany({ where: { userId: a.userId }, data: { providerConsent: false, whatsappReminders: false } });
      await tx.notification.updateMany({ where: { userId: a.userId, status: { in: ['PENDING', 'FAILED'] } }, data: { status: 'CANCELLED' } });
      return request;
    }); return { data: { request: { id: request.id, status: request.status }, accessEnded: true, recordsDeleted: false } };
  });
  app.get('/api/v1/me/export', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async r => {
    const a = await actor(r), q = parse(z.object({ category: z.enum(['profile', 'programs', 'orders', 'memberships', 'appointments', 'memories', 'conversations', 'messages', 'consents', 'goals', 'checkins', 'reminders', 'addresses']),
      page: z.coerce.number().int().min(1).max(10000).default(1), conversationId: z.string().uuid().optional() }).strict(), r.query);
    const range = { take: 21, skip: (q.page - 1) * 20, orderBy: { id: 'asc' as const } }; let items: unknown[];
    switch (q.category) {
      case 'profile': items = q.page === 1 ? [await db!.user.findUnique({ where: { id: a.userId }, select: { fullName: true, phone: true, language: true, interests: true, createdAt: true, notifications: true } })] : []; break;
      case 'programs': items = await db!.programEnrollment.findMany({ ...range, where: { userId: a.userId }, select: { id: true, programId: true, status: true, enrolledAt: true, completedAt: true } }); break;
      case 'orders': items = await db!.order.findMany({ ...range, where: { userId: a.userId }, select: orderSelect }); break;
      case 'memberships': items = await db!.subscription.findMany({ ...range, where: { userId: a.userId }, select: subscriptionSelect }); break;
      case 'appointments': items = await db!.consultation.findMany({ ...range, where: { userId: a.userId }, select: appointmentSelect }); break;
      case 'memories': items = await db!.aIMemory.findMany({ ...range, where: { userId: a.userId }, select: { id: true, text: true, createdAt: true, updatedAt: true } }); break;
      case 'conversations': items = await db!.aIConversation.findMany({ ...range, where: { userId: a.userId }, select: { id: true, createdAt: true, updatedAt: true } }); break;
      case 'messages': {
        if (q.conversationId && !await db!.aIConversation.findFirst({ where: { id: q.conversationId, userId: a.userId } })) throw new ApiError(404, 'NOT_FOUND', 'Conversation not found.');
        items = await db!.aIMessage.findMany({ ...range, where: { ...(q.conversationId ? { conversationId: q.conversationId } : {}), conversation: { userId: a.userId } }, select: { id: true, conversationId: true, prompt: true, response: true, createdAt: true } }); break;
      }
      case 'goals': items = await db!.wellnessGoal.findMany({ ...range, where: { userId: a.userId }, select: { id: true, title: true, target: true, startDate: true, targetDate: true, progress: true, status: true } }); break;
      case 'checkins': items = await db!.wellnessCheckIn.findMany({ ...range, where: { userId: a.userId }, select: { id: true, date: true, mood: true, energy: true, sleepHours: true, waterMl: true, activityMinutes: true, weightKg: true, habitCompleted: true } }); break;
      case 'reminders': items = await db!.reminder.findMany({ ...range, where: { userId: a.userId }, select: { id: true, title: true, kind: true, dueAt: true, completed: true } }); break;
      case 'addresses': items = await db!.address.findMany({ ...range, where: { userId: a.userId }, select: { id: true, fullName: true, phone: true, line1: true, line2: true, city: true, state: true, pinCode: true, country: true } }); break;
      case 'consents': items = await db!.consentRecord.findMany({ ...range, where: { userId: a.userId }, select: { id: true, type: true, version: true, granted: true, createdAt: true } }); break;
    }
    return { data: { category: q.category, page: q.page, items: items.slice(0, 20), hasMore: items.length > 20 } };
  });
}
