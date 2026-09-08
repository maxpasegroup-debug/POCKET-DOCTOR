import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import { benefitsFor } from '../membership/entitlements.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { decide, OpenAIProvider, DevelopmentAIProvider, type AIProvider } from './provider.js';
import { baseReply, safetyRoute } from './safety.js';
import { AIContextBuilder } from './context-builder.js';
import { messageInput, parse } from './contracts.js';

export const missing = () => new ApiError(404, 'NOT_FOUND', 'This item is not available.');
export class AssistantService {
  constructor(private db: PrismaClient, private env: Environment, private provider?: AIProvider) {}
  async conversation(userId: string, id: string) {
    const value = await this.db.aIConversation.findFirst({ where: { userId, id }, select: { id: true, createdAt: true,
      messages: { orderBy: { createdAt: 'asc' }, take: 100, select: { id: true, prompt: true, response: true, createdAt: true } } } });
    if (!value) throw missing(); return value;
  }
  // A per-user PostgreSQL lock serializes requests across API instances and makes
  // quotas/idempotency atomic. No model can write or invoke a mutating tool.
  async message(userId: string, conversationId: string, raw: unknown, transaction?: Prisma.TransactionClient) {
    const input = parse(messageInput, raw);
    const execute = async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 505))`;
      const conversation = await tx.aIConversation.findFirst({ where: { id: conversationId, userId } });
      if (!conversation) throw missing();
      const existing = await tx.aIMessage.findUnique({ where: { conversationId_requestKey: { conversationId, requestKey: input.requestKey } } });
      if (existing) {
        if (existing.prompt !== input.text) throw new ApiError(409, 'INVALID_REQUEST', 'Use a new request for a different message.');
        return { reply: existing.response, messageId: existing.id };
      }
      if (await tx.aIMessage.count({ where: { conversationId } }) >= 100) throw new ApiError(409, 'AI_HISTORY_LIMIT', 'Start a new conversation.');
      const recent = await tx.aIAuditEvent.count({ where: { userId, event: 'ai_message_attempt', createdAt: { gte: new Date(Date.now() - 60000) } } });
      const daily = await tx.aIAuditEvent.count({ where: { userId, event: 'ai_message_attempt', createdAt: { gte: new Date(Date.now() - 86400000) } } });
      const extra = (await benefitsFor(tx, this.env, userId)).find(b => b.key === 'AI_WELLNESS_FEATURES')?.value ?? 0;
      if (recent >= 10 || daily >= 100 + extra) throw new ApiError(429, 'RATE_LIMITED', 'Please try again later.');
      await tx.aIAuditEvent.create({ data: { userId, event: 'ai_message_attempt' } });
      let intent = safetyRoute(input.text);
      const prefs = await tx.aIPreferences.findUnique({ where: { userId } });
      if (!intent) {
        if (this.env.AI_PROVIDER === 'disabled') return { failure: 'AI_UNAVAILABLE' as const };
        if (!prefs?.providerConsent) return { failure: 'AI_CONSENT_REQUIRED' as const };
        const history = await tx.aIMessage.findMany({ where: { conversationId }, select: { prompt: true }, orderBy: { createdAt: 'desc' }, take: 4 });
        try {
          const provider = this.provider ?? (this.env.AI_PROVIDER === 'openai' ? new OpenAIProvider(this.env) : new DevelopmentAIProvider());
          intent = (await decide(provider, { text: input.text, history: history.reverse().map(v => v.prompt) }, this.env.AI_TIMEOUT_MS)).intent;
        } catch { return { failure: 'AI_UNAVAILABLE' as const }; }
      }
      const reply = baseReply(intent, this.env.AI_PROVIDER);
      // No sensitive facts are ever loaded for emergency, diagnosis or privacy paths.
      reply.facts = await new AIContextBuilder(tx, this.env, userId).facts(intent);
      if (['programs', 'consultations', 'orders', 'products', 'goals', 'reminders'].includes(intent) && !reply.facts.length) reply.text += ' There are no saved items to show yet.';
      const message = await tx.aIMessage.create({ data: { conversationId, requestKey: input.requestKey, prompt: input.text, response: reply as unknown as Prisma.InputJsonValue } });
      await tx.aIConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      await tx.aIAuditEvent.create({ data: { userId, event: reply.classification === 'doctor' ? 'ai_escalation_to_doctor' : 'ai_message_sent', classification: reply.classification } });
      return { reply, messageId: message.id };
    };
    // Verified channel adapters can share their transaction instead of nesting
    // transactions and exhausting the configured connection pool.
    return transaction ? execute(transaction) : this.db.$transaction(execute, { timeout: this.env.AI_TIMEOUT_MS + 10000, maxWait: 1000 });
  }
}
