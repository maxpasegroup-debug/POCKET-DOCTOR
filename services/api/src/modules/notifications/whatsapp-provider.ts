import { z } from 'zod';
import type { Environment } from '../../config/env.js';
export type DeliveryResult = { status: 'SENT'; reference: string } | { status: 'FAILED' | 'UNKNOWN' | 'CANCELLED'; reason: string };
// Generic transactional notice only. No marketing template or private health facts.
export class WhatsAppNotificationProvider {
  constructor(private env: Environment, private transport: typeof fetch = fetch) {}
  async send(recipient: string, lastInboundAt: Date, consent: boolean): Promise<DeliveryResult> {
    if (this.env.WHATSAPP_OUTBOUND !== 'cloud') return { status: 'CANCELLED', reason: 'NOT_CONFIGURED' };
    if (!consent || !/^\d{7,20}$/.test(recipient) || lastInboundAt.getTime() > Date.now() || Date.now() - lastInboundAt.getTime() >= 24 * 3600000) return { status: 'CANCELLED', reason: 'CONSENT_OR_WINDOW' };
    try {
      const response = await this.transport(`https://graph.facebook.com/${this.env.WHATSAPP_API_VERSION}/${this.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST', headers: { authorization: `Bearer ${this.env.WHATSAPP_ACCESS_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: recipient, type: 'text',
          text: { preview_url: false, body: 'You have an update in Pocket Doctor. Open the app to view it securely.' } }),
        signal: AbortSignal.timeout(8000), redirect: 'error',
      });
      if (!response.ok) return { status: response.status >= 500 ? 'UNKNOWN' : 'FAILED', reason: response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_REJECTED' };
      if (!response.body) return { status: 'UNKNOWN', reason: 'INVALID_RESPONSE' };
      const reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
      while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 8192) { await reader.cancel(); return { status: 'UNKNOWN', reason: 'INVALID_RESPONSE' }; } chunks.push(item.value); }
      const parsed = z.object({ messages: z.array(z.object({ id: z.string().min(1).max(160) })).length(1) }).safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (!parsed.success) return { status: 'UNKNOWN', reason: 'INVALID_RESPONSE' };
      return { status: 'SENT', reference: parsed.data.messages[0]!.id }; // Accepted is not delivered.
    } catch { return { status: 'UNKNOWN', reason: 'PROVIDER_TIMEOUT_OR_NETWORK' }; }
  }
}
