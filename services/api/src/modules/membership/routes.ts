import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { authenticate, authorize } from '../auth/authorization.js';
import { IdentityService } from '../auth/identity-service.js';
import { parse } from '../assistant/contracts.js';
import { MembershipService } from './membership-service.js';
import { checkoutInput, subscribeInput, planInput, couponInput } from './contracts.js';
import { benefitsFor } from './entitlements.js';
export function registerMembershipRoutes(app: FastifyInstance, env: Environment, db?: PrismaClient) {
  const service = db ? new MembershipService(db, env) : undefined;
  const identity = db ? new IdentityService(db, env) : undefined;
  async function context(r: FastifyRequest, admin = false) {
    if (!service || !identity || !db) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Membership is unavailable right now.');
    const principal = await authenticate(r, identity); authorize(principal, admin ? ['ADMIN'] : ['USER']);
    return { service, userId: principal.userId, db };
  }
  const id = (r: FastifyRequest) => parse(z.object({ id: z.string().uuid() }), r.params).id;
  const page = (r: FastifyRequest) => parse(z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) }).strict(), r.query).page;
  app.get('/api/v1/membership/plans', async r => ({ data: { items: await (await context(r)).service.plans() } }));
  app.get('/api/v1/membership/current', async r => { const c = await context(r); return { data: await c.service.current(c.userId) }; });
  app.get('/api/v1/membership/benefits', async r => { const c = await context(r); return { data: { items: await benefitsFor(c.db, env, c.userId) } }; });
  app.post('/api/v1/membership/coupon/validate', async r => { const c = await context(r); const b = parse(checkoutInput, r.body); return { data: await c.service.review(c.userId, b.planId, b.coupon) }; });
  app.post('/api/v1/membership/subscribe', async r => { const c = await context(r); return { data: await c.service.subscribe(c.userId, parse(subscribeInput, r.body)) }; });
  app.post('/api/v1/membership/payments/:id/development-settle', async r => { const c = await context(r); return { data: await c.service.settle(c.userId, id(r), parse(z.object({ outcome: z.enum(['capture', 'fail']) }).strict(), r.body).outcome) }; });
  for (const action of ['cancel', 'reactivate'] as const) app.post(`/api/v1/membership/:id/${action}`, async r => { const c = await context(r); parse(z.object({}).strict(), r.body ?? {}); return { data: { subscription: await c.service.cancel(c.userId, id(r), action === 'reactivate') } }; });
  app.get('/api/v1/membership/history', async r => { const c = await context(r); return { data: { items: await c.service.history(c.userId, page(r)) } }; });
  app.get('/api/v1/membership/events', async r => { const c = await context(r); return { data: { items: await c.db.subscriptionEvent.findMany({ where: { subscription: { userId: c.userId } }, select: { id: true, kind: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20, skip: (page(r) - 1) * 20 }) } }; });
  app.get('/api/v1/me/revenue/transactions', async r => { const c = await context(r); return { data: { items: await c.service.transactions(c.userId, page(r)) } }; });
  app.get('/api/v1/me/invoices', async r => { const c = await context(r); return { data: { items: await c.db.invoice.findMany({ where: { payment: { userId: c.userId } }, orderBy: { issuedAt: 'desc' }, take: 20, skip: (page(r) - 1) * 20 }) } }; });
  app.get('/api/v1/me/invoices/:id', async r => { const c = await context(r); return { data: { item: await c.service.invoice(c.userId, id(r)) } }; });
  app.post('/api/v1/membership/payments/:id/refund-request', async r => { const c = await context(r); parse(z.object({}).strict(), r.body ?? {}); return { data: await c.service.requestRefund(c.userId, id(r)) }; });
  app.post('/api/v1/admin/membership/plans', async r => {
    const c = await context(r, true); const b = parse(planInput, r.body); const { benefits, ...plan } = b;
    return { data: { item: await c.db.membershipPlan.create({ data: { ...plan, benefits: { create: benefits } }, include: { benefits: true } }) } };
  });
  app.patch('/api/v1/admin/membership/plans/:id', async r => {
    const c = await context(r, true); const b = parse(planInput, r.body); const { benefits, ...plan } = b;
    return { data: { item: await c.db.membershipPlan.update({ where: { id: id(r) }, data: { ...plan, benefits: { deleteMany: {}, create: benefits } }, include: { benefits: true } }) } };
  });
  app.post('/api/v1/admin/membership/coupons', async r => {
    const c = await context(r, true); const { planIds, ...coupon } = parse(couponInput, r.body);
    return { data: { item: await c.db.coupon.create({ data: { ...coupon, plans: { create: planIds.map(planId => ({ planId })) } } }) } };
  });
  app.patch('/api/v1/admin/membership/coupons/:id', async r => { const c = await context(r, true); const body = parse(z.object({ active: z.boolean() }).strict(), r.body); return { data: { item: await c.db.coupon.update({ where: { id: id(r) }, data: body }) } }; });
  app.get('/api/v1/admin/revenue', async r => {
    const c = await context(r, true);
    const q = parse(z.object({ days: z.coerce.number().int().min(1).max(366).default(30), demo: z.enum(['true', 'false']).default('false') }).strict(), r.query);
    await c.service.cleanup();
    const from = new Date(Date.now() - q.days * 86400000); const provider = q.demo === 'true' ? 'development' : 'razorpay';
    const revenue = await c.db.$queryRaw`SELECT date_trunc('day', COALESCE("verifiedAt", "createdAt")) AS day,
      date_trunc('month', COALESCE("verifiedAt", "createdAt")) AS month,
      CASE WHEN "subscriptionId" IS NOT NULL THEN 'MEMBERSHIP' WHEN "programId" IS NOT NULL THEN 'PROGRAM' WHEN "consultationId" IS NOT NULL THEN 'CONSULTATION' ELSE 'WELLNESS' END AS source,
      "currency", "status", count(*)::int AS count, sum("amountPaise")::float8 AS "amountPaise"
      FROM "EnrollmentPayment" WHERE "createdAt" >= ${from} AND "provider" = ${provider}
      GROUP BY day, month, source, "currency", "status" ORDER BY day DESC`;
    const memberships = await c.db.subscription.groupBy({ by: ['status'], where: { provider }, _count: true });
    const totals = await c.db.enrollmentPayment.groupBy({ by: ['currency', 'status'], where: { provider, createdAt: { gte: from } }, _count: true, _sum: { amountPaise: true } });
    const monthly = await c.db.$queryRaw`SELECT date_trunc('month', COALESCE("verifiedAt", "createdAt")) AS month,
      CASE WHEN "subscriptionId" IS NOT NULL THEN 'MEMBERSHIP' WHEN "programId" IS NOT NULL THEN 'PROGRAM' WHEN "consultationId" IS NOT NULL THEN 'CONSULTATION' ELSE 'WELLNESS' END AS source,
      "currency", "status", count(*)::int AS count, sum("amountPaise")::float8 AS "amountPaise"
      FROM "EnrollmentPayment" WHERE "createdAt" >= ${from} AND "provider" = ${provider}
      GROUP BY month, source, "currency", "status" ORDER BY month DESC`;
    const events = await c.db.subscriptionEvent.groupBy({ by: ['kind'], where: { createdAt: { gte: from }, subscription: { provider } }, _count: true });
    const coupons = await c.db.couponRedemption.count({ where: { redeemedAt: { gte: from }, payment: { provider } } });
    const refunds = await c.db.enrollmentPayment.groupBy({ by: ['refundStatus'], where: { provider, createdAt: { gte: from } }, _count: true });
    const wellnessRefunds = await c.db.order.groupBy({ by: ['refundStatus'], where: { payments: { some: { provider } }, createdAt: { gte: from } }, _count: true });
    const consultationRefunds = await c.db.consultation.groupBy({ by: ['refundStatus'], where: { payments: { some: { provider } }, createdAt: { gte: from } }, _count: true });
    return { data: { revenue, monthly, totals, memberships, events, coupons, mode: provider, refunds, wellnessRefunds, consultationRefunds, runtimeViewCounts: c.service.analytics.snapshot(), refundNotice: 'Refund states represent requests unless a provider confirms completion. Live processing is unconfigured.' } };
  });
}
