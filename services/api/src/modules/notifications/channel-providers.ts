import { createSign } from 'node:crypto';
import { z } from 'zod';
import type { Environment } from '../../config/env.js';

export type DeliveryResult = { status: 'SENT'; reference: string } |
  { status: 'FAILED' | 'UNKNOWN' | 'INVALID_DESTINATION' | 'BLOCKED'; reason: string };
export const publicNotification = 'There is an update in your Pocket Doctor account. Open the app to view it.';
export interface NotificationChannelProvider {
  send(input: { destination: string; eventId: string }): Promise<DeliveryResult>;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.body) throw new Error();
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length;
    if (size > 65536) { await reader.cancel(); throw new Error(); } parts.push(part.value); }
  return JSON.parse(Buffer.concat(parts).toString('utf8')) as Record<string, unknown>;
}

// Only a verified, opted-in contact may be passed by the future contact workflow.
// No arbitrary-recipient API is exposed. The fixed template contains no health facts.
export class ResendEmailProvider implements NotificationChannelProvider {
  constructor(private env: Environment, private transport: typeof fetch = fetch) {}
  async send(input: { destination: string; eventId: string }): Promise<DeliveryResult> {
    if (this.env.EMAIL_PROVIDER !== 'resend') return { status: 'BLOCKED', reason: 'NOT_CONFIGURED' };
    if (!z.email().safeParse(input.destination).success || !z.uuid().safeParse(input.eventId).success)
      return { status: 'INVALID_DESTINATION', reason: 'INVALID_RECIPIENT' };
    try {
      const response = await this.transport('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { authorization: `Bearer ${this.env.RESEND_API_KEY}`, 'content-type': 'application/json', 'idempotency-key': `notification/${input.eventId}` },
        body: JSON.stringify({ from: this.env.EMAIL_FROM, to: [input.destination], subject: 'Pocket Doctor account update', text: publicNotification }),
      });
      if (!response.ok) return { status: response.status === 429 ? 'FAILED' : 'UNKNOWN', reason: 'PROVIDER_REJECTED' };
      const payload = await readJson(response);
      if (typeof payload.id !== 'string' || !z.uuid().safeParse(payload.id).success) throw new Error();
      return { status: 'SENT', reference: payload.id };
    } catch { return { status: 'UNKNOWN', reason: 'DELIVERY_UNCONFIRMED' }; }
  }
}

export const firebaseAccount = z.object({
  project_id: z.string().regex(/^[a-z][a-z0-9-]{4,62}$/),
  client_email: z.email().refine(value => value.endsWith('.gserviceaccount.com')),
  private_key: z.string().min(64),
});

export class FcmPushProvider implements NotificationChannelProvider {
  private access: { token: string; expiresAt: number } | undefined;
  constructor(private env: Environment, private transport: typeof fetch = fetch) {}
  private async credentials() {
    const account = firebaseAccount.parse(JSON.parse(this.env.FCM_SERVICE_ACCOUNT_JSON));
    if (this.access && this.access.expiresAt > Date.now() + 60000) return { account, token: this.access.token };
    const issued = Math.floor(Date.now() / 1000);
    const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: issued, exp: issued + 3600 })}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
    const result = await this.transport('https://oauth2.googleapis.com/token', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    });
    if (!result.ok) throw new Error();
    const value = z.object({ access_token: z.string().min(1), expires_in: z.number().positive().max(3600), token_type: z.literal('Bearer') }).parse(await readJson(result));
    this.access = { token: value.access_token, expiresAt: Date.now() + value.expires_in * 1000 };
    return { account, token: value.access_token };
  }
  async send(input: { destination: string; eventId: string }): Promise<DeliveryResult> {
    if (this.env.PUSH_PROVIDER !== 'fcm') return { status: 'BLOCKED', reason: 'NOT_CONFIGURED' };
    if (!/^[A-Za-z0-9_:.-]{20,4096}$/.test(input.destination) || !z.uuid().safeParse(input.eventId).success)
      return { status: 'INVALID_DESTINATION', reason: 'INVALID_TOKEN' };
    let credentials: Awaited<ReturnType<FcmPushProvider['credentials']>>;
    try { credentials = await this.credentials(); }
    catch { return { status: 'FAILED', reason: 'PROVIDER_AUTH_UNAVAILABLE' }; }
    try {
      const { account, token } = credentials;
      const response = await this.transport(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: { token: input.destination, notification: { title: 'Pocket Doctor', body: publicNotification },
          data: { notificationId: input.eventId }, android: { ttl: '3600s', collapse_key: input.eventId } } }),
      });
      const result = await readJson(response);
      if (response.ok && typeof result.name === 'string' && result.name.startsWith(`projects/${account.project_id}/messages/`))
        return { status: 'SENT', reference: result.name };
      const details = (result.error as { details?: { errorCode?: string }[] } | undefined)?.details;
      if (details?.some(error => error.errorCode === 'UNREGISTERED')) return { status: 'INVALID_DESTINATION', reason: 'UNREGISTERED' };
      if (response.status === 401) { this.access = undefined; return { status: 'FAILED', reason: 'PROVIDER_AUTH_EXPIRED' }; }
      if (response.status === 429) return { status: 'FAILED', reason: 'PROVIDER_RATE_LIMIT' };
      return { status: 'UNKNOWN', reason: 'DELIVERY_UNCONFIRMED' };
    } catch { return { status: 'UNKNOWN', reason: 'DELIVERY_UNCONFIRMED' }; }
  }
}
