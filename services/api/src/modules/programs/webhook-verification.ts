import { createHmac, timingSafeEqual } from 'node:crypto';

// Shared Razorpay adapter boundary. Verify the exact raw bytes before parsing.
// Signature verification is necessary, but NOT sufficient to grant access:
// the adapter must also fetch captured status and match the persisted order.
export function verifyRazorpayWebhook(rawBody: Buffer, signature: string, secret: string) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
