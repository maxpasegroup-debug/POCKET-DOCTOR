import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';

export const userSelect = { id: true, fullName: true, language: true, accountStatus: true, createdAt: true,
  profileCompletedAt: true } satisfies Prisma.UserSelect;
export const appointmentSelect = { id: true, userId: true, doctorId: true, startsAt: true, endsAt: true, status: true,
  feePaise: true, currency: true, refundStatus: true, mode: true } satisfies Prisma.ConsultationSelect;
export const paymentSelect = { id: true, userId: true, programId: true, consultationId: true, orderId: true, subscriptionId: true,
  amountPaise: true, currency: true, provider: true, status: true, refundStatus: true, providerReference: true,
  createdAt: true, verifiedAt: true } satisfies Prisma.EnrollmentPaymentSelect;
export const subscriptionSelect = { id: true, userId: true, planId: true, status: true, pricePaise: true, currency: true, periodStart: true,
  periodEnd: true, cancelAtPeriodEnd: true, provider: true } satisfies Prisma.SubscriptionSelect;
export const orderSelect = { id: true, userId: true, status: true, totalPaise: true, currency: true, createdAt: true, refundStatus: true } satisfies Prisma.OrderSelect;
export function readiness(env: Environment) {
  return [{ name: 'Sign-in delivery', status: env.OTP_MODE === 'development' ? 'LOCAL DEMO' : 'NOT CONFIGURED' },
    { name: 'Payments', status: env.PAYMENT_MODE === 'development' ? 'LOCAL DEMO' : 'NOT CONFIGURED' },
    { name: 'Admin second factor', status: env.ADMIN_SECURITY_MODE === 'totp' ? 'CONFIGURED — VALIDATION REQUIRED' : env.ADMIN_SECURITY_MODE.toUpperCase() },
    { name: 'WhatsApp inbound', status: env.WHATSAPP_MODE === 'webhook' ? 'CONFIGURED — VALIDATION REQUIRED' : 'DISABLED' },
    { name: 'AI provider', status: env.AI_PROVIDER.toUpperCase() },
    { name: 'WhatsApp outbound', status: env.WHATSAPP_OUTBOUND === 'cloud' ? 'CONFIGURED — VALIDATION REQUIRED' : 'DISABLED' },
    { name: 'Refund processing', status: env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET ? 'CONFIGURED' : 'NOT CONFIGURED' },
    { name: 'Push / email', status: 'NOT CONFIGURED' }, { name: 'Backups / deployment', status: 'EXTERNAL VALIDATION REQUIRED' }];
}
export async function dashboard(db: PrismaClient, env: Environment) {
  const [users, active, doctors, members, enrollments, consultations, orders, failed, pendingDoctors, privacy, notificationFailures, revenue] = await Promise.all([
    db.user.count(), db.user.count({ where: { accountStatus: 'ACTIVE', sessions: { some: { expiresAt: { gt: new Date() } } } } }),
    db.doctor.count({ where: { verificationStatus: 'VERIFIED', isDemo: false } }),
    db.subscription.count({ where: { status: { in: ['ACTIVE', 'CANCELLED'] }, periodEnd: { gt: new Date() }, provider: 'razorpay' } }),
    db.programEnrollment.count(), db.consultation.count(), db.order.count(), db.enrollmentPayment.count({ where: { status: 'FAILED', provider: 'razorpay' } }),
    db.doctor.count({ where: { verificationStatus: 'PENDING_VERIFICATION' } }), db.privacyRequest.count({ where: { status: 'PENDING_REVIEW' } }),
    db.notification.count({ where: { status: { in: ['FAILED', 'DEAD_LETTER'] } } }),
    db.enrollmentPayment.aggregate({ where: { status: 'VERIFIED', provider: 'razorpay', currency: 'INR' }, _sum: { amountPaise: true } }),
  ]);
  const metrics = [['Total users', users], ['Users with active sessions', active], ['Verified non-demo doctors', doctors], ['Active paid memberships', members],
    ['Program enrollments', enrollments], ['Appointments', consultations], ['Orders', orders], ['Failed production payments', failed],
    ['Captured revenue (INR, before refunds)', (revenue._sum.amountPaise ?? 0) / 100]].map(([label, value]) => ({ label, value }));
  return { metrics, pending: [{ label: 'Doctor verification', value: pendingDoctors }, { label: 'Privacy requests', value: privacy },
    { label: 'Notification failures', value: notificationFailures }], environment: env.APP_ENV, readiness: readiness(env) };
}
export async function listOperations(db: PrismaClient, domain: string, page: number, q: string, pending = false) {
  const range = { take: 21, skip: (page - 1) * 20 }; const match = { contains: q, mode: 'insensitive' as const };
  let items: unknown[];
  switch (domain) {
    case 'users': items = await db.user.findMany({ ...range, where: q ? { OR: [{ fullName: match }, { phone: match }] } : {}, select: userSelect, orderBy: { id: 'asc' } }); break;
    case 'doctors': items = await db.doctor.findMany({ ...range, where: { ...(q ? { OR: [{ name: match }, { specialty: match }] } : {}), ...(pending ? { verificationStatus: 'PENDING_VERIFICATION' as const, registrationSubmittedAt: { not: null } } : {}) }, orderBy: { id: 'asc' } }); break;
    case 'programs': items = (await db.program.findMany({ ...range, where: q ? { title: match } : {}, orderBy: { id: 'asc' } })).map(programDto); break;
    case 'categories': items = await db.programCategory.findMany({ ...range, orderBy: { id: 'asc' } }); break;
    case 'products': items = await db.wellnessProduct.findMany({ ...range, where: q ? { name: match } : {}, orderBy: { id: 'asc' } }); break;
    case 'orders': items = await db.order.findMany({ ...range, select: orderSelect, orderBy: { id: 'asc' } }); break;
    case 'appointments': items = await db.consultation.findMany({ ...range, select: appointmentSelect, orderBy: { id: 'asc' } }); break;
    case 'memberships': items = await db.subscription.findMany({ ...range, select: subscriptionSelect, orderBy: { id: 'asc' } }); break;
    case 'plans': items = await db.membershipPlan.findMany({ ...range, include: { benefits: true }, orderBy: { id: 'asc' } }); break;
    case 'coupons': items = await db.coupon.findMany({ ...range, include: { plans: true }, orderBy: { id: 'asc' } }); break;
    case 'payments': items = await db.enrollmentPayment.findMany({ ...range, select: paymentSelect, orderBy: { id: 'asc' } }); break;
    case 'audit': items = await db.adminAuditEvent.findMany({ ...range, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }); break;
    case 'ai': { const counts = await db.aIAuditEvent.groupBy({ by: ['event'], where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } }, _count: true }); items = counts; break; }
    case 'whatsapp': items = await db.providerEvent.findMany({ ...range, where: { provider: 'whatsapp' }, orderBy: { id: 'asc' } }); break;
    case 'payment-events': items = await db.providerEvent.findMany({ ...range, where: { provider: 'razorpay' }, orderBy: { id: 'asc' } }); break;
    case 'notifications': items = await db.notification.findMany({ ...range, select: { id: true, kind: true, channel: true, status: true, attempts: true, lastError: true, createdAt: true }, orderBy: { id: 'asc' } }); break;
    case 'privacy-requests': items = await db.privacyRequest.findMany({ ...range, orderBy: { id: 'asc' } }); break;
    default: throw new ApiError(404, 'NOT_FOUND', 'This administration area is not available.');
  }
  return { items: items.slice(0, 20), page, hasMore: items.length > 20 };
}
export function programDto<T extends { published: boolean; archivedAt: Date | null }>(p: T) { return { ...p, publicationStatus: p.archivedAt ? 'ARCHIVED' : p.published ? 'PUBLISHED' : 'DRAFT' }; }
export async function operationDetail(db: PrismaClient, domain: string, id: string) {
  let item: unknown;
  switch (domain) {
    case 'users': item = await db.user.findUnique({ where: { id }, select: { ...userSelect, phone: true, roles: { select: { role: true } },
      _count: { select: { enrollments: true, consultations: true, orders: true, subscriptions: true } } } }); break;
    case 'doctors': item = await db.doctor.findUnique({ where: { id }, include: { availability: true, exceptions: true } }); break;
    case 'programs': { const p = await db.program.findUnique({ where: { id }, include: { modules: { orderBy: { position: 'asc' }, include: { lessons: { orderBy: { position: 'asc' } } } }, liveSessions: true } }); item = p ? programDto(p) : null; break; }
    case 'products': item = await db.wellnessProduct.findUnique({ where: { id } }); break;
    case 'orders': item = await db.order.findUnique({ where: { id }, select: { ...orderSelect, carrier: true, trackingNumber: true, payments: { select: paymentSelect }, items: true, events: true } }); break;
    case 'appointments': item = await db.consultation.findUnique({ where: { id }, select: { ...appointmentSelect, payments: { select: paymentSelect } } }); break;
    case 'plans': item = await db.membershipPlan.findUnique({ where: { id }, include: { benefits: true } }); break;
    case 'coupons': item = await db.coupon.findUnique({ where: { id }, include: { plans: true } }); break;
    case 'payments': item = await db.enrollmentPayment.findUnique({ where: { id }, select: { ...paymentSelect, invoice: true } }); break;
    default: throw new ApiError(404, 'NOT_FOUND', 'This detail view is not available.');
  }
  if (!item) throw new ApiError(404, 'NOT_FOUND', 'This record is not available.');
  return { item };
}
