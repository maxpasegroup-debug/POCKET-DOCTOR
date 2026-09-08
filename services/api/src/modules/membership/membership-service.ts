import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { DevelopmentPaymentProvider, receiptMatches } from '../programs/payment-provider.js';
import { benefitInput, discountPrice, periodEnd, MembershipAnalytics } from './contracts.js';
import { membershipAccess, benefitsFor } from './entitlements.js';
type Tx = Prisma.TransactionClient;
const unavailable = () => new ApiError(503, 'PAYMENT_UNAVAILABLE', 'Production recurring payments remain unconfigured.');
const conflict = (message: string) => new ApiError(409, 'MEMBERSHIP_CONFLICT', message);
const missing = () => new ApiError(404, 'NOT_FOUND', 'Membership record not found.');

export class MembershipService {
  readonly analytics = new MembershipAnalytics();
  constructor(private db: PrismaClient, private env: Environment) {}
  private demo() { if (this.env.PAYMENT_MODE !== 'development' || !['development', 'test'].includes(this.env.APP_ENV) || this.env.NODE_ENV === 'production') throw unavailable(); }
  private atomic<T>(fn: (tx: Tx) => Promise<T>) {
    return this.db.$transaction(async tx => {
      // One membership product today. Serializes coupon reservations and subscription transitions across instances.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(760006)`;
      return fn(tx);
    }, { timeout: 15000 });
  }
  async plans() {
    this.analytics.recordView();
    return this.db.membershipPlan.findMany({ where: { active: true, ...(this.env.PAYMENT_MODE === 'development' && ['development', 'test'].includes(this.env.APP_ENV) && this.env.NODE_ENV !== 'production' ? {} : { isDemo: false }) }, include: { benefits: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }], take: 30 });
  }
  private async lifecycle(tx: Tx, userId?: string) {
    const now = new Date();
    const approaching = await tx.subscription.findMany({ where: { ...(userId ? { userId } : {}), status: 'ACTIVE', cancelAtPeriodEnd: false, periodEnd: { gt: now, lte: new Date(now.getTime() + 7 * 86400000) } }, take: 500 });
    for (const s of approaching) {
      if (!await tx.subscriptionEvent.findFirst({ where: { subscriptionId: s.id, kind: 'renewal_approaching', createdAt: { gte: s.periodStart ?? s.createdAt } } })) {
        await tx.subscriptionEvent.create({ data: { subscriptionId: s.id, kind: 'renewal_approaching' } });
      }
    }
    const timedOut = await tx.enrollmentPayment.findMany({ where: { ...(userId ? { userId } : {}), status: 'PENDING', subscription: { pendingUntil: { lte: now } } }, take: 500 });
    for (const p of timedOut) {
      await tx.enrollmentPayment.update({ where: { id: p.id }, data: { status: 'FAILED' } });
      await tx.subscriptionEvent.create({ data: { subscriptionId: p.subscriptionId!, kind: 'checkout_expired' } });
    }
    const rows = await tx.subscription.findMany({ where: { ...(userId ? { userId } : {}), OR: [
      { status: 'PENDING', pendingUntil: { lte: now } },
      { status: { in: ['ACTIVE', 'CANCELLED'] }, periodEnd: { lte: now } },
      { status: 'PAST_DUE', graceEnd: { lte: now } },
    ] }, take: 500 });
    for (const s of rows) {
      const grace = s.status === 'ACTIVE' && !s.isTrial && !s.cancelAtPeriodEnd && s.graceDays > 0 && s.periodEnd &&
        await tx.enrollmentPayment.count({ where: { subscriptionId: s.id, status: 'FAILED', createdAt: { gte: s.periodStart ?? s.createdAt } } }) > 0;
      const graceEnd = grace ? new Date(s.periodEnd!.getTime() + s.graceDays * 86400000) : null;
      const inGrace = graceEnd !== null && graceEnd > now;
      await tx.subscription.update({ where: { id: s.id }, data: { status: inGrace ? 'PAST_DUE' : 'EXPIRED', graceEnd } });
      await tx.subscriptionEvent.create({ data: { subscriptionId: s.id, kind: inGrace ? 'membership_past_due' : 'membership_expired' } });
      await tx.enrollmentPayment.updateMany({ where: { subscriptionId: s.id, status: 'PENDING' }, data: { status: 'FAILED' } });
    }
    return rows.length;
  }
  cleanup() { return this.atomic(tx => this.lifecycle(tx)); }
  private dto(s: Prisma.SubscriptionGetPayload<{ include: { plan: true } }>) {
    return { id: s.id, planId: s.planId, name: s.plan.name, status: s.status, pricePaise: s.pricePaise, currency: s.currency, interval: s.interval, benefits: s.benefits,
      periodStart: s.periodStart, periodEnd: s.periodEnd, graceEnd: s.graceEnd, cancelAtPeriodEnd: s.cancelAtPeriodEnd, isTrial: s.isTrial, mode: s.provider,
      renewalBehavior: 'Manual renewal only. No automatic debit is configured.', cancellationPolicy: 'Cancel now; benefits remain until the current period ends.' };
  }
  async current(userId: string) {
    await this.atomic(tx => this.lifecycle(tx, userId));
    const s = await this.db.subscription.findFirst({ where: { userId }, include: { plan: true }, orderBy: { createdAt: 'desc' } });
    return { subscription: s ? this.dto(s) : null, entitled: !!await membershipAccess(this.db, this.env, userId), benefits: await benefitsFor(this.db, this.env, userId) };
  }
  private async quote(tx: Tx, userId: string, planId: string, code: string, renewal = false) {
    const plan = await tx.membershipPlan.findFirst({ where: { id: planId, active: true }, include: { benefits: true } });
    if (!plan) throw missing();
    if (plan.isDemo) this.demo();
    let coupon = code ? await tx.coupon.findUnique({ where: { code }, include: { plans: true } }) : null;
    if (!code && !renewal) coupon = await tx.coupon.findFirst({ where: { active: true, introductory: true, plans: { some: { planId } }, startsAt: { lte: new Date() }, endsAt: { gt: new Date() } }, include: { plans: true }, orderBy: { code: 'asc' } });
    let price = plan.pricePaise;
    if (code && !coupon) throw new ApiError(400, 'COUPON_INVALID', 'This offer is not available.');
    if (coupon) {
      const now = new Date();
      const used = { couponId: coupon.id, OR: [{ redeemedAt: { not: null } }, { reservedUntil: { gt: now }, payment: { status: 'PENDING' as const } }] };
      const valid = coupon.active && coupon.startsAt <= now && coupon.endsAt > now && coupon.plans.some(p => p.planId === planId) &&
        await tx.couponRedemption.count({ where: used }) < coupon.usageLimit && await tx.couponRedemption.count({ where: { ...used, userId } }) < coupon.perUserLimit &&
        (!coupon.introductory || !await tx.subscription.count({ where: { userId, payments: { some: { status: 'VERIFIED' } } } }));
      if (!valid && code) throw new ApiError(400, 'COUPON_INVALID', 'This offer is expired, used, or unavailable for this plan.');
      if (valid) price = discountPrice(plan.pricePaise, coupon.type, coupon.value); else coupon = null;
    }
    return { plan, coupon, price };
  }
  async review(userId: string, planId: string, code: string) {
    return this.atomic(async tx => {
      const q = await this.quote(tx, userId, planId, code);
      const current = await tx.subscription.findFirst({ where: { userId, planId, status: { in: ['ACTIVE', 'PAST_DUE'] } } });
      if (current) { q.plan.pricePaise = current.pricePaise; q.price = current.pricePaise; q.coupon = null; }
      return { plan: q.plan, basePaise: q.plan.pricePaise, discountPaise: q.plan.pricePaise - q.price, amountPaise: q.price, currency: q.plan.currency, coupon: q.coupon?.code ?? null,
        renewalPricePaise: q.plan.pricePaise, mode: q.plan.isDemo ? 'development' : 'disabled', renewalBehavior: 'Manual renewal. No automatic debit.', cancellationPolicy: 'Benefits remain until the current period ends.' };
    });
  }
  async subscribe(userId: string, input: { planId: string; coupon: string; requestKey: string; trial: boolean; renew: boolean }) {
    this.demo();
    return this.atomic(async tx => {
      await this.lifecycle(tx, userId);
      const existingPayment = await tx.enrollmentPayment.findUnique({ where: { userId_requestKey: { userId, requestKey: input.requestKey } }, include: { subscription: { include: { plan: true } } } });
      if (existingPayment?.subscription) {
        if (existingPayment.subscription.planId !== input.planId) throw conflict('This checkout belongs to another plan.');
        return { subscription: this.dto(existingPayment.subscription), payment: existingPayment };
      }
      const prior = await tx.subscription.findUnique({ where: { userId_requestKey: { userId, requestKey: input.requestKey } }, include: { plan: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 } } });
      if (prior) {
        if (prior.planId !== input.planId) throw conflict('This checkout belongs to another plan.');
        return { subscription: this.dto(prior), payment: prior.payments[0] ?? null };
      }
      const current = await tx.subscription.findFirst({ where: { userId, status: { in: ['PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED'] } }, include: { plan: true } });
      if (current && (!input.renew || current.planId !== input.planId || !['ACTIVE', 'PAST_DUE'].includes(current.status))) throw conflict('Manage your current membership before joining another plan.');
      if (current && current.periodEnd && current.periodEnd.getTime() > Date.now() + 7 * 86400000 && !current.isTrial) throw conflict('Manual renewal opens seven days before your period ends.');
      if (current && await tx.enrollmentPayment.count({ where: { subscriptionId: current.id, status: 'PENDING' } })) throw conflict('Finish the pending renewal first.');
      const q = await this.quote(tx, userId, input.planId, input.coupon, !!current);
      if (!q.plan.isDemo) throw unavailable();
      if (input.trial && (current || q.plan.trialDays === 0 || await tx.subscription.count({ where: { userId, trialUsed: true } }))) throw conflict('A trial is not available for this account.');
      const pendingUntil = new Date(Date.now() + 15 * 60000);
      const benefits = q.plan.benefits.map(({ key, label, resourceIds, value }) => benefitInput.parse({ key, label, resourceIds, value }));
      const sub = current ?? await tx.subscription.create({ data: { userId, planId: q.plan.id, pricePaise: q.plan.pricePaise, currency: q.plan.currency, interval: q.plan.interval,
        benefits, graceDays: q.plan.graceDays, provider: 'development', requestKey: input.requestKey, pendingUntil,
        ...(input.trial ? { status: 'ACTIVE', trialUsed: true, isTrial: true, periodStart: new Date(), periodEnd: new Date(Date.now() + q.plan.trialDays * 86400000) } : {}) }, include: { plan: true } });
      if (input.trial) {
        await tx.subscriptionEvent.create({ data: { subscriptionId: sub.id, kind: 'trial_started' } });
        return { subscription: this.dto(sub), payment: null };
      }
      // Renewals retain the agreed regular price; offers are only initial-term pricing.
      const amount = current ? sub.pricePaise : q.price;
      if (current && input.coupon) throw conflict('Coupons apply to the first paid term only.');
      const payment = await tx.enrollmentPayment.create({ data: { userId, subscriptionId: sub.id, requestKey: input.requestKey, amountPaise: amount, currency: sub.currency, provider: 'development' } });
      if (q.coupon && !current) await tx.couponRedemption.create({ data: { userId, couponId: q.coupon.id, paymentId: payment.id, basePaise: q.plan.pricePaise, discountPaise: q.plan.pricePaise - q.price, reservedUntil: pendingUntil } });
      if (q.coupon && !current) await tx.subscriptionEvent.create({ data: { subscriptionId: sub.id, kind: 'coupon_applied', notificationPending: false } });
      await tx.subscription.update({ where: { id: sub.id }, data: { pendingUntil } });
      await tx.subscriptionEvent.create({ data: { subscriptionId: sub.id, kind: current ? 'renewal_started' : 'membership_checkout_started' } });
      return { subscription: this.dto(sub), payment };
    });
  }
  async settle(userId: string, id: string, outcome: 'capture' | 'fail') {
    this.demo();
    return this.atomic(async tx => {
      await this.lifecycle(tx, userId);
      const p = await tx.enrollmentPayment.findFirst({ where: { id, userId, subscriptionId: { not: null }, provider: 'development' }, include: { subscription: { include: { plan: true } }, redemption: true } });
      if (!p?.subscription) throw missing();
      const s = p.subscription;
      if (p.status !== 'PENDING') return { verified: p.status === 'VERIFIED', subscription: this.dto(s) };
      if (s.pendingUntil <= new Date() || !['PENDING', 'ACTIVE', 'PAST_DUE'].includes(s.status)) throw conflict('This checkout has expired. Start a new checkout.');
      const receipt = await new DevelopmentPaymentProvider(this.env, p, outcome).verify(p.id);
      const verified = receiptMatches(p, receipt);
      await tx.enrollmentPayment.update({ where: { id }, data: { status: verified ? 'VERIFIED' : 'FAILED', providerReference: receipt.reference, verifiedAt: verified ? new Date() : null } });
      const renewal = s.periodStart !== null;
      const start = s.periodEnd && s.periodEnd > new Date() && !s.isTrial ? s.periodEnd : new Date();
      const end = periodEnd(start, s.interval);
      const updated = await tx.subscription.update({ where: { id: s.id }, data: verified ? { status: 'ACTIVE', periodStart: start, periodEnd: end, graceEnd: null, isTrial: false, cancelAtPeriodEnd: false } :
        s.periodEnd && s.periodEnd > new Date() ? { graceEnd: !s.isTrial && s.graceDays > 0 ? new Date(s.periodEnd.getTime() + s.graceDays * 86400000) : null } : { status: 'PAYMENT_FAILED' }, include: { plan: true } });
      if (verified && p.redemption) await tx.couponRedemption.update({ where: { paymentId: id }, data: { redeemedAt: new Date() } });
      await tx.subscriptionEvent.create({ data: { subscriptionId: s.id, kind: verified ? s.isTrial ? 'trial_converted' : renewal ? 'membership_renewed' : 'membership_purchased' : renewal ? 'renewal_failed' : 'payment_failed' } });
      return { verified, subscription: this.dto(updated) };
    });
  }
  async cancel(userId: string, id: string, reactivate = false) {
    return this.atomic(async tx => {
      await this.lifecycle(tx, userId);
      const sub = await tx.subscription.findFirst({ where: { id, userId }, include: { plan: true } });
      if (!sub) throw missing();
      if (reactivate) {
        this.demo();
        if (sub.provider !== 'development' || sub.status !== 'CANCELLED' || !sub.periodEnd || sub.periodEnd <= new Date()) throw conflict('Renew membership to start a new period.');
      } else if (sub.status === 'CANCELLED') return this.dto(sub);
      else if (!['ACTIVE', 'PENDING', 'PAST_DUE'].includes(sub.status)) throw conflict('This membership has already ended.');
      const updated = await tx.subscription.update({ where: { id }, data: reactivate ? { status: 'ACTIVE', cancelAtPeriodEnd: false, cancelledAt: null } :
        { status: sub.periodEnd && sub.periodEnd > new Date() ? 'CANCELLED' : 'EXPIRED', cancelAtPeriodEnd: true, cancelledAt: new Date() }, include: { plan: true } });
      await tx.enrollmentPayment.updateMany({ where: { subscriptionId: id, status: 'PENDING' }, data: { status: 'FAILED' } });
      await tx.subscriptionEvent.create({ data: { subscriptionId: id, kind: reactivate ? 'membership_reactivated' : 'membership_cancelled' } });
      return this.dto(updated);
    });
  }
  async history(userId: string, page: number) {
    const rows = await this.db.subscription.findMany({ where: { userId }, include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 20, skip: (page - 1) * 20 });
    return rows.map(s => this.dto(s));
  }
  async transactions(userId: string, page: number) {
    return this.db.enrollmentPayment.findMany({ where: { userId }, select: { id: true, amountPaise: true, currency: true, status: true, provider: true, createdAt: true, programId: true, consultationId: true, orderId: true, subscriptionId: true, invoice: { select: { id: true, number: true } } }, orderBy: { createdAt: 'desc' }, take: 20, skip: (page - 1) * 20 });
  }
  async requestRefund(userId: string, id: string) {
    const p = await this.db.enrollmentPayment.findFirst({ where: { id, userId, subscriptionId: { not: null }, status: 'VERIFIED' } });
    if (!p) throw missing();
    await this.db.enrollmentPayment.updateMany({ where: { id, refundStatus: 'NOT_REQUESTED' }, data: { refundStatus: 'REFUND_REQUESTED' } });
    return { status: 'REFUND_REQUESTED', message: 'Your request is recorded. No money has been returned. Provider refund processing is not configured.' };
  }
  async invoice(userId: string, id: string) {
    const row = await this.db.invoice.findFirst({ where: { id, payment: { userId } }, include: { payment: { select: { provider: true, status: true } } } });
    if (!row) throw missing(); return row;
  }
}
