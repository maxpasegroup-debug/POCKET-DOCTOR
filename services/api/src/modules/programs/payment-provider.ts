import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';

export interface PaymentReceipt {
  reference: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  captured: boolean;
}

// A real Razorpay adapter must create orders server-side, verify the signature,
// fetch captured payment status and compare order, amount and currency. A client
// success callback alone is never a receipt. No production adapter is enabled.
export interface PaymentProvider {
  verify(orderId: string): Promise<PaymentReceipt>;
}

export class DevelopmentPaymentProvider implements PaymentProvider {
  private receipt: PaymentReceipt;
  constructor(env: Environment, order: { id: string; amountPaise: number; currency: string }, outcome: 'capture' | 'fail') {
    if (env.PAYMENT_MODE !== 'development' || !['development', 'test'].includes(env.APP_ENV) || env.NODE_ENV === 'production') {
      throw new ApiError(503, 'PAYMENT_UNAVAILABLE', 'Payments are not available yet.');
    }
    // Local simulator is the provider, not evidence of a real transaction.
    this.receipt = { reference: `demo_${order.id}`, orderId: order.id, amountPaise: order.amountPaise,
      currency: order.currency, captured: outcome === 'capture' };
  }
  async verify(orderId: string) {
    if (orderId !== this.receipt.orderId) throw new ApiError(400, 'PAYMENT_FAILED', 'Payment could not be verified.');
    return this.receipt;
  }
}

export function receiptMatches(order: { id: string; amountPaise: number; currency: string }, receipt: PaymentReceipt) {
  return receipt.captured && receipt.orderId === order.id && receipt.amountPaise === order.amountPaise &&
    receipt.currency === order.currency && receipt.reference.length > 0;
}
