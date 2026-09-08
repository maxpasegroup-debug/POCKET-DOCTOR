import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Environment } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { ApiError } from '../../errors/api-error.js';
import { verifyRazorpayWebhook } from '../programs/webhook-verification.js';

// Durable verified event inbox. Fulfilment is deliberately NOT inferred from a
// webhook alone: reconciliation must fetch provider state and match our ledger.
export function registerPaymentWebhook(app: FastifyInstance, env: Environment, db?: PrismaClient) {
  app.register(async scope => {
    scope.removeContentTypeParser('application/json');
    scope.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 65536 }, (_, body, done) => done(null, body));
    scope.post('/api/v1/payments/razorpay/webhook', async r => {
      if (!db || !env.RAZORPAY_WEBHOOK_SECRET) throw new ApiError(503, 'PAYMENT_UNAVAILABLE', 'Payment verification is unavailable.');
      const signature = r.headers['x-razorpay-signature'];
      if (!Buffer.isBuffer(r.body) || typeof signature !== 'string' || !verifyRazorpayWebhook(r.body, signature, env.RAZORPAY_WEBHOOK_SECRET)) throw new ApiError(401, 'INVALID_SIGNATURE', 'Webhook verification failed.');
      const eventId = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).safeParse(r.headers['x-razorpay-event-id']);
      let raw: unknown; try { raw = JSON.parse(r.body.toString('utf8')); } catch { throw new ApiError(400, 'INVALID_REQUEST', 'Invalid webhook.'); }
      const parsed = z.object({ event: z.enum(['payment.captured', 'payment.failed', 'refund.processed', 'refund.failed', 'subscription.charged', 'subscription.cancelled']),
        payload: z.record(z.string(), z.object({ entity: z.object({ id: z.string().regex(/^[A-Za-z0-9_]{1,160}$/) }) })) }).safeParse(raw);
      if (!eventId.success || !parsed.success) throw new ApiError(400, 'INVALID_REQUEST', 'Unsupported payment event.');
      const kind = parsed.data.event.split('.')[0]!; const reference = parsed.data.payload[kind]?.entity.id;
      if (!reference) throw new ApiError(400, 'INVALID_REQUEST', 'Payment event reference is missing.');
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${eventId.data}, 7708))::text`;
        const previous = await tx.providerEvent.findUnique({ where: { provider_eventId: { provider: 'razorpay', eventId: eventId.data } } });
        if (previous && (previous.kind !== parsed.data.event || previous.reference !== reference)) throw new ApiError(409, 'EVENT_CONFLICT', 'Payment event conflicts with an existing event.');
        if (!previous) await tx.providerEvent.create({ data: { provider: 'razorpay', eventId: eventId.data, kind: parsed.data.event, reference, requestId: r.id, status: 'RECONCILIATION_REQUIRED' } });
      });
      return { data: { received: true } };
    });
  });
}
