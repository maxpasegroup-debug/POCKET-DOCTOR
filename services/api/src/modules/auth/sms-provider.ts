import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';

export interface SmsOtpProvider { send(phone: string, code: string): Promise<void> }

// Local OTP generation, hashing, expiry and verification remain in IdentityService.
// Provider acceptance is not delivery. Never automatically retry this POST.
export class TwilioSmsProvider implements SmsOtpProvider {
  constructor(private env: Environment, private transport: typeof fetch = fetch) {}
  async send(phone: string, code: string) {
    if (this.env.SMS_PROVIDER !== 'twilio' || !/^\+91[6-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(code))
      throw new ApiError(503, 'OTP_UNAVAILABLE', 'Verification messages are unavailable.');
    try {
      const body = new URLSearchParams({ To: phone, MessagingServiceSid: this.env.TWILIO_MESSAGING_SERVICE_SID,
        Body: this.env.SMS_OTP_TEMPLATE.replace('{code}', code), ValidityPeriod: '300' });
      const response = await this.transport(`https://api.twilio.com/2010-04-01/Accounts/${this.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { authorization: `Basic ${Buffer.from(`${this.env.TWILIO_ACCOUNT_SID}:${this.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body });
      if (!response.ok || !response.body) throw new Error();
      const reader = response.body.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
      while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length;
        if (bytes > 65536) { await reader.cancel(); throw new Error(); } chunks.push(part.value); }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { sid?: string; status?: string };
      if (!/^SM[a-fA-F0-9]{32}$/.test(result.sid ?? '') || !['accepted', 'queued', 'sending', 'sent', 'delivered'].includes(result.status ?? '')) throw new Error();
    } catch { throw new ApiError(503, 'OTP_UNAVAILABLE', 'We could not send a verification code. Please wait a moment and request a new code.'); }
  }
}
