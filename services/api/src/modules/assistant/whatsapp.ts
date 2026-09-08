import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { AssistantService } from './assistant-service.js';
import { parse } from './contracts.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function requestId(value: string) {
  const s = hash(value);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}
export function validSignature(raw: Buffer, signature: unknown, secret: string) {
  if (typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature) || secret.length < 32) return false;
  return timingSafeEqual(Buffer.from(signature.slice(7), 'hex'), createHmac('sha256', secret).update(raw).digest());
}
export class WhatsAppService {
  constructor(private db: PrismaClient, private env: Environment) {}
  async status(userId: string) {
    const identity = await this.db.whatsAppIdentity.findUnique({ where: { userId } });
    const link = await this.db.whatsAppLinkToken.findUnique({ where: { userId } });
    return { connected: !!identity, maskedIdentity: identity ? `••••${identity.waId.slice(-4)}` : null,
      pendingIdentity: link?.candidateWaId && link.expiresAt > new Date() ? `••••${link.candidateWaId.slice(-4)}` : null,
      providerReady: this.env.WHATSAPP_MODE === 'webhook', deliveryAvailable: false,
      notificationDeliveryConfigured: this.env.WHATSAPP_OUTBOUND === 'cloud' };
  }
  async createLink(userId: string) {
    if (this.env.WHATSAPP_MODE !== 'webhook') throw new ApiError(503, 'WHATSAPP_UNAVAILABLE', 'WhatsApp connection is not available yet.');
    const code = randomBytes(32).toString('base64url'); const expiresAt = new Date(Date.now() + 300000);
    await this.db.whatsAppLinkToken.upsert({ where: { userId }, create: { userId, tokenHash: hash(code), expiresAt }, update: { tokenHash: hash(code), expiresAt, candidateWaId: null } });
    return { code, expiresAt, instruction: 'Send LINK followed by this code to the configured Pocket Doctor WhatsApp account. Return here and confirm the matching number. This code expires in five minutes.' };
  }
  async confirm(userId: string) {
    return this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(5055)`;
      const link = await tx.whatsAppLinkToken.findUnique({ where: { userId } });
      if (!link?.candidateWaId || link.expiresAt <= new Date()) throw new ApiError(400, 'LINK_INVALID', 'The link has expired or has not been received.');
      const existing = await tx.whatsAppIdentity.findUnique({ where: { waId: link.candidateWaId } });
      if (existing && existing.userId !== userId) throw new ApiError(409, 'LINK_INVALID', 'This identity is already linked.');
      await tx.whatsAppIdentity.upsert({ where: { userId }, create: { userId, waId: link.candidateWaId }, update: { waId: link.candidateWaId, linkedAt: new Date() } });
      await tx.whatsAppLinkToken.delete({ where: { userId } });
      await tx.aIAuditEvent.create({ data: { userId, event: 'whatsapp_linked' } });
      await tx.consentRecord.create({ data: { userId, type: 'WHATSAPP', version: '1', granted: true } });
      return { connected: true, deliveryAvailable: false };
    });
  }
  async disconnect(userId: string) {
    await this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(5055)`;
      await tx.whatsAppIdentity.deleteMany({ where: { userId } }); await tx.whatsAppLinkToken.deleteMany({ where: { userId } });
      await tx.aIPreferences.updateMany({ where: { userId }, data: { whatsappReminders: false } });
      await tx.consentRecord.create({ data: { userId, type: 'WHATSAPP', version: '1', granted: false } });
      await tx.notification.updateMany({ where: { userId, channel: 'WHATSAPP', status: { in: ['PENDING', 'FAILED'] } }, data: { status: 'CANCELLED' } });
    }); return { connected: false };
  }
  // Called only from the signature-verified webhook. waId never comes from an app
  // account parameter. Linking also needs a signed-in app confirmation.
  async inbound(messageId: string, waId: string, text: string) {
    return this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(5055)`;
      if (await tx.whatsAppReceipt.findUnique({ where: { id: messageId } })) return { duplicate: true };
      if (/^LINK [A-Za-z0-9_-]{43}$/.test(text)) {
        const link = await tx.whatsAppLinkToken.findUnique({ where: { tokenHash: hash(text.slice(5)) } });
        if (link && link.expiresAt > new Date() && !link.candidateWaId) {
          await tx.whatsAppLinkToken.update({ where: { userId: link.userId }, data: { candidateWaId: waId } });
        }
      } else {
        const identity = await tx.whatsAppIdentity.findUnique({ where: { waId } });
        if (identity && await tx.user.findFirst({ where: { id: identity.userId, accountStatus: 'ACTIVE' }, select: { id: true } })) {
          await tx.whatsAppIdentity.update({ where: { waId }, data: { lastInboundAt: new Date() } });
          // Inbound chat uses the same account and safety pipeline. Only explicitly
          // linked identities qualify; a matching User.phone is never sufficient.
          const prefs = await tx.aIPreferences.findUnique({ where: { userId: identity.userId } });
          if (prefs?.providerConsent) {
            const conversationId = requestId(`whatsapp:${identity.userId}:${new Date().toISOString().slice(0, 10)}`);
            const conversation = await tx.aIConversation.upsert({ where: { id: conversationId }, create: { id: conversationId, userId: identity.userId }, update: {}, select: { id: true } });
            // Chat stays in the app. A provider-ready webhook must not leak account
            // facts into an HTTP ACK. Delivery will use a separately authorized adapter.
            await new AssistantService(this.db, this.env).message(identity.userId, conversation.id, { text, requestKey: requestId(messageId) }, tx);
          }
        }
      }
      await tx.whatsAppReceipt.create({ data: { id: messageId } });
      return { accepted: true, delivered: false };
    }, { timeout: this.env.AI_TIMEOUT_MS + 15000, maxWait: 1000 });
  }
  async deliveryStatus(reference: string, recipient: string, status: 'sent' | 'delivered' | 'read' | 'failed', timestamp: string, correlationId: string) {
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${reference}, 7709))::text`;
      const notification = await tx.notification.findFirst({ where: { providerReference: reference, channel: 'WHATSAPP', user: { whatsappIdentity: { waId: recipient } } } });
      if (!notification) return;
      const eventId = hash(`${reference}:${status}:${timestamp}`);
      await tx.providerEvent.upsert({ where: { provider_eventId: { provider: 'whatsapp', eventId } }, create: { provider: 'whatsapp', eventId, kind: `message.${status}`, reference, requestId: correlationId, status: 'PROCESSED' }, update: {} });
      const allowed: Record<string, string[]> = { sent: ['SENT', 'UNKNOWN'], delivered: ['SENT', 'UNKNOWN', 'FAILED'], read: ['SENT', 'DELIVERED', 'UNKNOWN', 'FAILED'], failed: ['SENT', 'UNKNOWN'] };
      if (allowed[status]!.includes(notification.status)) await tx.notification.update({ where: { id: notification.id }, data: { status: status.toUpperCase(), ...(status === 'failed' ? { lastError: 'PROVIDER_REJECTED' } : {}) } });
    });
  }
}

export function registerWhatsAppWebhook(app: FastifyInstance, env: Environment, service?: WhatsAppService) {
  const enabled = () => { if (env.WHATSAPP_MODE !== 'webhook' || !service) throw new ApiError(503, 'WHATSAPP_UNAVAILABLE', 'WhatsApp is unavailable.'); };
  // Encapsulated raw parser: signature checks use exact bytes, not reserialized JSON.
  app.register(async scope => {
    scope.removeContentTypeParser('application/json');
    scope.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 32768 }, (_, body, done) => done(null, body));
    scope.get('/api/v1/integrations/whatsapp/webhook', async (r, reply) => {
      enabled(); const q = parse(z.object({ 'hub.mode': z.literal('subscribe'), 'hub.verify_token': z.string().max(300), 'hub.challenge': z.string().max(100) }), r.query);
      const supplied = hash(q['hub.verify_token']);
      if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(hash(env.WHATSAPP_VERIFY_TOKEN)))) throw new ApiError(403, 'FORBIDDEN', 'Verification failed.');
      return reply.type('text/plain').send(q['hub.challenge']);
    });
    scope.post('/api/v1/integrations/whatsapp/webhook', async r => {
      enabled(); if (!Buffer.isBuffer(r.body) || !validSignature(r.body, r.headers['x-hub-signature-256'], env.WHATSAPP_APP_SECRET)) throw new ApiError(401, 'UNAUTHORIZED', 'Webhook verification failed.');
      let raw: unknown; try { raw = JSON.parse(r.body.toString('utf8')); } catch { throw new ApiError(400, 'INVALID_REQUEST', 'Invalid webhook.'); }
      const schema = z.object({ object: z.literal('whatsapp_business_account'), entry: z.array(z.object({ id: z.string().optional(), changes: z.array(z.object({ field: z.literal('messages'), value: z.object({
        metadata: z.object({ phone_number_id: z.string() }), messages: z.array(z.object({ id: z.string().min(1).max(200), from: z.string().regex(/^\d{7,20}$/), timestamp: z.string().regex(/^\d+$/), type: z.string(), text: z.object({ body: z.string().max(2000) }).optional() })).max(10).optional(),
        statuses: z.array(z.object({ id: z.string().min(1).max(160), recipient_id: z.string().regex(/^\d{7,20}$/), status: z.enum(['sent', 'delivered', 'read', 'failed']), timestamp: z.string().regex(/^\d+$/) })).max(30).optional(),
      }) })).max(10) })).max(10) });
      const payload = parse(schema, raw);
      for (const entry of payload.entry) for (const change of entry.changes) {
        if (env.WHATSAPP_BUSINESS_ID && entry.id !== env.WHATSAPP_BUSINESS_ID) throw new ApiError(403, 'FORBIDDEN', 'Webhook business identity mismatch.');
        if (change.value.metadata.phone_number_id !== env.WHATSAPP_PHONE_NUMBER_ID) throw new ApiError(403, 'FORBIDDEN', 'Webhook identity mismatch.');
        for (const status of change.value.statuses ?? []) await service!.deliveryStatus(status.id, status.recipient_id, status.status, status.timestamp, r.id);
        for (const m of change.value.messages ?? []) {
          const age = Date.now() - Number(m.timestamp) * 1000;
          if (m.type === 'text' && m.text && age >= -60000 && age <= 86400000) await service!.inbound(m.id, m.from, m.text.body);
        }
      }
      return { received: true };
    });
  });
}
