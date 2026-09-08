import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../../errors/api-error.js';

const providerId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]{1,80}$`));
const money = z.number().int().min(0).max(100000000);
const orderSchema = z.object({ id: providerId('order'), amount: money, currency: z.literal('INR'), receipt: z.string(), status: z.enum(['created', 'attempted', 'paid']) });
const paymentSchema = z.object({ id: providerId('pay'), order_id: providerId('order'), amount: money, currency: z.literal('INR'), status: z.enum(['created', 'authorized', 'captured', 'refunded', 'failed']), captured: z.boolean(), amount_refunded: money });
const refundSchema = z.object({ id: providerId('rfnd'), payment_id: providerId('pay'), amount: money, currency: z.literal('INR'), status: z.enum(['pending', 'processed', 'failed']) });
export interface RazorpayConfiguration { keyId: string; keySecret: string; mode: 'test' | 'live' }

// Fixed provider origin, bounded response, no card fields, no raw provider errors.
// Callers persist operation intent BEFORE POST. Ambiguous timeouts require
// reconciliation; these money-moving methods deliberately do not retry blindly.
export class RazorpayProvider {
  constructor(private config: RazorpayConfiguration, private transport: typeof fetch = fetch) {
    if (!new RegExp(`^rzp_${config.mode}_[A-Za-z0-9]+$`).test(config.keyId) || config.keySecret.length < 16) throw new Error('Razorpay configuration is incomplete');
  }
  private async request<T>(path: string, schema: z.ZodType<T>, body?: object): Promise<T> {
    try {
      const result = await this.transport(`https://api.razorpay.com/v1${path}`, { method: body ? 'POST' : 'GET',
        headers: { authorization: `Basic ${Buffer.from(`${this.config.keyId}:${this.config.keySecret}`).toString('base64')}`, 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (!result.ok || !result.body) throw new Error();
      const reader = result.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
      while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length;
        if (length > 65536) { await reader.cancel(); throw new Error(); } chunks.push(part.value); }
      return schema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch { throw new ApiError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Payment verification is temporarily unavailable. Please check the payment status before trying again.'); }
  }
  async createOrder(input: { ledgerId: string; amountPaise: number; currency: string }) {
    z.object({ ledgerId: z.string().uuid(), amountPaise: money.positive(), currency: z.literal('INR') }).parse(input);
    const order = await this.request('/orders', orderSchema, { receipt: input.ledgerId, amount: input.amountPaise, currency: input.currency, partial_payment: false });
    if (order.receipt !== input.ledgerId || order.amount !== input.amountPaise || order.currency !== input.currency) throw new ApiError(409, 'PAYMENT_MISMATCH', 'Payment order could not be confirmed.');
    return order;
  }
  async verifyPayment(input: { paymentId: string; orderId: string; amountPaise: number; currency: string }) {
    providerId('pay').parse(input.paymentId); providerId('order').parse(input.orderId);
    const payment = await this.request(`/payments/${input.paymentId}`, paymentSchema);
    if (payment.id !== input.paymentId || payment.order_id !== input.orderId || payment.amount !== input.amountPaise || payment.currency !== input.currency || payment.status !== 'captured' || !payment.captured || payment.amount_refunded !== 0)
      throw new ApiError(409, 'PAYMENT_NOT_CAPTURED', 'This payment has not been confirmed for this purchase.');
    return { reference: payment.id, orderId: payment.order_id, amountPaise: payment.amount, currency: payment.currency, captured: true };
  }
  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const expected = createHmac('sha256', this.config.keySecret).update(`${orderId}|${paymentId}`).digest();
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
  }
  async requestRefund(paymentId: string, amountPaise: number, requestId: string) {
    providerId('pay').parse(paymentId); money.positive().parse(amountPaise); z.string().uuid().parse(requestId);
    const refund = await this.request(`/payments/${paymentId}/refund`, refundSchema, { amount: amountPaise, speed: 'normal', receipt: requestId });
    if (refund.payment_id !== paymentId || refund.amount !== amountPaise) throw new ApiError(409, 'REFUND_MISMATCH', 'Refund status requires review.');
    return refund;
  }
  async verifyRefund(refundId: string, paymentId: string, amountPaise: number) {
    providerId('rfnd').parse(refundId); providerId('pay').parse(paymentId);
    const refund = await this.request(`/refunds/${refundId}`, refundSchema);
    if (refund.id !== refundId || refund.payment_id !== paymentId || refund.amount !== amountPaise || refund.currency !== 'INR') throw new ApiError(409, 'REFUND_MISMATCH', 'Refund status requires review.');
    return refund;
  }
}
