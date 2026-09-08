import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { RazorpayProvider } from './razorpay.js';

export class RefundService {
  constructor(private db: PrismaClient, private env: Environment, private provider?: RazorpayProvider) {}
  private adapter() {
    if (this.provider) return this.provider;
    const mode = this.env.RAZORPAY_KEY_ID.startsWith('rzp_test_') ? 'test' : 'live';
    if (!this.env.RAZORPAY_KEY_ID || !this.env.RAZORPAY_KEY_SECRET) throw new ApiError(503, 'PAYMENT_UNAVAILABLE', 'Refund provider configuration is pending.');
    return new RazorpayProvider({ mode, keyId: this.env.RAZORPAY_KEY_ID, keySecret: this.env.RAZORPAY_KEY_SECRET });
  }
  async process(id: string, requestId: string) {
    const provider = this.adapter();
    const payment = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "EnrollmentPayment" WHERE "id"=${id}::uuid FOR UPDATE`;
      const payment = await tx.enrollmentPayment.findUnique({ where: { id }, include: { order: true, consultation: true, subscription: true } });
      if (!payment || payment.provider !== 'razorpay' || payment.status !== 'VERIFIED' || !payment.providerReference || payment.refundStatus !== 'REFUND_REQUESTED') throw new ApiError(409, 'INVALID_STATE', 'This refund is not eligible for processing.');
      if ((payment.order && payment.order.status !== 'CANCELLED') || (payment.consultation && payment.consultation.status !== 'CANCELLED') ||
        (payment.subscription && !['CANCELLED', 'EXPIRED'].includes(payment.subscription.status))) throw new ApiError(409, 'INVALID_STATE', 'Cancel the purchase before processing its refund.');
      if (payment.subscriptionId) {
        const latest = await tx.enrollmentPayment.findFirst({ where: { subscriptionId: payment.subscriptionId, status: 'VERIFIED' }, orderBy: [{ verifiedAt: 'desc' }, { id: 'desc' }] });
        if (latest?.id !== id) throw new ApiError(409, 'REFUND_REVIEW_REQUIRED', 'Historical membership charges require a separate retention and entitlement review.');
      }
      await tx.providerEvent.create({ data: { provider: 'razorpay', eventId: `refund:${id}`, kind: 'refund.request', reference: payment.providerReference, requestId, status: 'PROCESSING' } });
      await tx.enrollmentPayment.update({ where: { id }, data: { refundStatus: 'REFUND_PROCESSING' } });
      return payment;
    });
    try {
      const refund = await provider.requestRefund(payment.providerReference!, payment.amountPaise, payment.id);
      await this.db.providerEvent.update({ where: { provider_eventId: { provider: 'razorpay', eventId: `refund:${id}` } }, data: { reference: refund.id, status: 'RECONCILIATION_REQUIRED' } });
      return this.reconcile(id);
    } catch (error) {
      // A timeout may follow a successful provider POST. Never post a second refund.
      await this.db.providerEvent.update({ where: { provider_eventId: { provider: 'razorpay', eventId: `refund:${id}` } }, data: { status: 'RECONCILIATION_REQUIRED' } });
      throw error;
    }
  }
  async reconcile(id: string) {
    const provider = this.adapter();
    const event = await this.db.providerEvent.findUnique({ where: { provider_eventId: { provider: 'razorpay', eventId: `refund:${id}` } } });
    const payment = await this.db.enrollmentPayment.findUnique({ where: { id } });
    if (!event?.reference.startsWith('rfnd_') || !payment?.providerReference || payment.provider !== 'razorpay') throw new ApiError(409, 'REFUND_REVIEW_REQUIRED', 'Match the provider refund reference through the operator reconciliation process. Do not retry the refund request.');
    const refund = await provider.verifyRefund(event.reference, payment.providerReference, payment.amountPaise);
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "EnrollmentPayment" WHERE "id"=${id}::uuid FOR UPDATE`;
      const current = await tx.enrollmentPayment.findUniqueOrThrow({ where: { id } });
      if (current.refundStatus === 'REFUNDED') return;
      const status = refund.status === 'processed' ? 'REFUNDED' : refund.status === 'failed' ? 'REFUND_FAILED' : 'REFUND_PROCESSING';
      await tx.enrollmentPayment.update({ where: { id }, data: { refundStatus: status } });
      await tx.providerEvent.update({ where: { id: event.id }, data: { status } });
      if (status === 'REFUNDED') {
        if (payment.orderId) await tx.order.update({ where: { id: payment.orderId }, data: { refundStatus: 'REFUNDED' } });
        if (payment.consultationId) await tx.consultation.update({ where: { id: payment.consultationId }, data: { refundStatus: 'REFUNDED' } });
        if (payment.subscriptionId) await tx.subscription.update({ where: { id: payment.subscriptionId }, data: { status: 'EXPIRED', graceEnd: null } });
      }
    });
    return { status: refund.status === 'processed' ? 'REFUNDED' : refund.status === 'failed' ? 'REFUND_FAILED' : 'REFUND_PROCESSING' };
  }
}
