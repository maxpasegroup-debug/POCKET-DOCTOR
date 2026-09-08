import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { authenticate, authorize } from '../auth/authorization.js';
import { IdentityService } from '../auth/identity-service.js';
import { AssistantService, missing } from './assistant-service.js';
import { parse, memoryInput, goalInput, checkInInput, reminderInput, preferenceInput } from './contracts.js';
import { WhatsAppService, registerWhatsAppWebhook } from './whatsapp.js';

export function registerAssistantRoutes(app: FastifyInstance, env: Environment, db?: PrismaClient) {
  const identity = db ? new IdentityService(db, env) : undefined;
  const assistant = db ? new AssistantService(db, env) : undefined;
  const whatsapp = db ? new WhatsAppService(db, env) : undefined;
  async function actor(r: FastifyRequest) {
    if (!db || !identity) throw new ApiError(503, 'AI_UNAVAILABLE', 'Assistant is unavailable.');
    const p = await authenticate(r, identity); authorize(p, ['USER']); return p.userId;
  }
  const id = (r: FastifyRequest) => parse(z.object({ id: z.string().uuid() }).strict(), r.params).id;
  const empty = (r: FastifyRequest) => parse(z.object({}).strict(), r.body ?? {});
  const page = (r: FastifyRequest) => parse(z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) }).strict(), r.query).page;
  const safe = <T extends { userId: string }>(row: T) => { const { userId: _, ...data } = row; return data; };
  const changed = (n: number) => { if (!n) throw missing(); return { data: { saved: true } }; };
  const event = (userId: string, name: string) => db!.aIAuditEvent.create({ data: { userId, event: name } });
  app.get('/api/v1/ai/status', async r => { await actor(r); return { data: { provider: env.AI_PROVIDER, available: env.AI_PROVIDER !== 'disabled', whatsappDelivery: false } }; });
  app.get('/api/v1/ai/conversations', async r => ({ data: { items: await db!.aIConversation.findMany({ where: { userId: await actor(r) }, select: { id: true, createdAt: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 20, skip: (page(r) - 1) * 20 }) } }));
  app.post('/api/v1/ai/conversations', async r => { const userId = await actor(r); empty(r);
    const count = await db!.aIConversation.count({ where: { userId } }); if (count >= 100) throw new ApiError(409, 'AI_HISTORY_LIMIT', 'Delete an old conversation first.');
    const item = await db!.aIConversation.create({ data: { userId }, select: { id: true, createdAt: true } }); await event(userId, 'ai_session_started'); return { data: { item } }; });
  app.get('/api/v1/ai/conversations/:id', async r => ({ data: { item: await assistant!.conversation(await actor(r), id(r)) } }));
  app.delete('/api/v1/ai/conversations/:id', async r => changed((await db!.aIConversation.deleteMany({ where: { userId: await actor(r), id: id(r) } })).count));
  app.post('/api/v1/ai/conversations/:id/messages', { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async r => {
    const result = await assistant!.message(await actor(r), id(r), r.body);
    if ('failure' in result) throw new ApiError(result.failure === 'AI_CONSENT_REQUIRED' ? 403 : 503, result.failure!, 'Your assistant needs attention in settings.');
    return { data: result };
  });
  app.get('/api/v1/ai/memory', async r => ({ data: { items: (await db!.aIMemory.findMany({ where: { userId: await actor(r) }, orderBy: { updatedAt: 'desc' }, take: 100 })).map(safe) } }));
  app.post('/api/v1/ai/memory', async r => { const userId = await actor(r); const data = parse(memoryInput, r.body);
    if (await db!.aIMemory.count({ where: { userId } }) >= 100) throw new ApiError(409, 'AI_RECORD_LIMIT', 'Please remove an older memory first.');
    return { data: { item: safe(await db!.aIMemory.create({ data: { userId, ...data } })) } }; });
  app.patch('/api/v1/ai/memory/:id', async r => changed((await db!.aIMemory.updateMany({ where: { userId: await actor(r), id: id(r) }, data: parse(memoryInput, r.body) })).count));
  app.delete('/api/v1/ai/memory/:id', async r => changed((await db!.aIMemory.deleteMany({ where: { userId: await actor(r), id: id(r) } })).count));
  app.delete('/api/v1/ai/memory', async r => { await db!.aIMemory.deleteMany({ where: { userId: await actor(r) } }); return { data: { saved: true } }; });
  app.get('/api/v1/me/goals', async r => ({ data: { items: (await db!.wellnessGoal.findMany({ where: { userId: await actor(r) }, orderBy: { createdAt: 'desc' }, take: 20, skip: (page(r) - 1) * 20 })).map(safe) } }));
  app.post('/api/v1/me/goals', async r => { const userId = await actor(r); const data = parse(goalInput, r.body);
    const item = safe(await db!.wellnessGoal.create({ data: { userId, ...data } })); await event(userId, 'goal_created'); return { data: { item } }; });
  app.patch('/api/v1/me/goals/:id', async r => changed((await db!.wellnessGoal.updateMany({ where: { userId: await actor(r), id: id(r) }, data: parse(goalInput, r.body) })).count));
  app.delete('/api/v1/me/goals/:id', async r => changed((await db!.wellnessGoal.deleteMany({ where: { userId: await actor(r), id: id(r) } })).count));
  app.get('/api/v1/me/check-ins', async r => ({ data: { items: (await db!.wellnessCheckIn.findMany({ where: { userId: await actor(r) }, orderBy: { date: 'desc' }, take: 20, skip: (page(r) - 1) * 20 })).map(safe) } }));
  app.post('/api/v1/me/check-ins', async r => { const userId = await actor(r); const data = parse(checkInInput, r.body);
    if (data.date > new Date()) throw new ApiError(400, 'INVALID_REQUEST', 'Choose today or an earlier date.');
    const item = safe(await db!.wellnessCheckIn.upsert({ where: { userId_date: { userId, date: data.date } }, create: { userId, ...data }, update: data }));
    await event(userId, 'checkin_completed'); return { data: { item } }; });
  app.delete('/api/v1/me/check-ins/:id', async r => changed((await db!.wellnessCheckIn.deleteMany({ where: { userId: await actor(r), id: id(r) } })).count));
  app.get('/api/v1/me/reminders', async r => ({ data: { items: (await db!.reminder.findMany({ where: { userId: await actor(r) }, orderBy: { dueAt: 'asc' }, take: 20, skip: (page(r) - 1) * 20 })).map(safe) } }));
  app.post('/api/v1/me/reminders', async r => { const userId = await actor(r); const data = parse(reminderInput, r.body);
    if (data.dueAt <= new Date()) throw new ApiError(400, 'INVALID_REQUEST', 'Choose a future reminder time.');
    const item = safe(await db!.reminder.create({ data: { userId, ...data } })); await event(userId, 'reminder_created'); return { data: { item } }; });
  app.patch('/api/v1/me/reminders/:id', async r => changed((await db!.reminder.updateMany({ where: { userId: await actor(r), id: id(r) }, data: parse(reminderInput, r.body) })).count));
  app.delete('/api/v1/me/reminders/:id', async r => changed((await db!.reminder.deleteMany({ where: { userId: await actor(r), id: id(r) } })).count));
  app.get('/api/v1/ai/preferences', async r => { const userId = await actor(r); const item = await db!.aIPreferences.upsert({ where: { userId }, create: { userId }, update: {} }); return { data: { item: safe(item) } }; });
  app.patch('/api/v1/ai/preferences', async r => { const userId = await actor(r); const data = parse(preferenceInput, r.body);
    const item = await db!.$transaction(async tx => {
      const result = await tx.aIPreferences.upsert({ where: { userId }, create: { userId, ...data }, update: data });
      await tx.consentRecord.create({ data: { userId, type: 'AI', version: '1', granted: data.providerConsent } });
      return result;
    }); return { data: { item: safe(item) } };
  });
  // In-app feed reuses Phase 3's consultation outbox. No second delivery worker.
  app.get('/api/v1/ai/reminder-events', async r => { const userId = await actor(r); const p = await db!.aIPreferences.findUnique({ where: { userId } });
    if (!p?.appReminders) return { data: { items: [] } };
    const kinds = ['PERSONAL', ...(p.programReminders ? ['PROGRAM'] : []), ...(p.consultationReminders ? ['CONSULTATION'] : []), ...(p.wellnessReminders ? ['WELLNESS'] : [])];
    const own = await db!.reminder.findMany({ where: { userId, completed: false, kind: { in: kinds }, dueAt: { lte: new Date() } }, orderBy: { dueAt: 'desc' }, take: 20 });
    const appointments = p.consultationReminders ? await db!.consultationReminder.findMany({ where: { status: 'PENDING', dueAt: { lte: new Date() }, consultation: { userId, status: 'CONFIRMED', startsAt: { gte: new Date() } } }, take: 10 }) : [];
    return { data: { items: [...own.map(v => ({ id: v.id, title: v.title, route: '/assistant/reminders' })), ...appointments.map(v => ({ id: v.id, title: 'Upcoming consultation', route: `/consultation/${v.consultationId}` }))] } };
  });
  app.get('/api/v1/integrations/whatsapp/link', async r => ({ data: await whatsapp!.status(await actor(r)) }));
  app.post('/api/v1/integrations/whatsapp/link', async r => { const userId = await actor(r); empty(r); return { data: await whatsapp!.createLink(userId) }; });
  app.post('/api/v1/integrations/whatsapp/confirm', async r => { const userId = await actor(r); empty(r); return { data: await whatsapp!.confirm(userId) }; });
  app.delete('/api/v1/integrations/whatsapp/link', async r => ({ data: await whatsapp!.disconnect(await actor(r)) }));
  registerWhatsAppWebhook(app, env, whatsapp);
}
