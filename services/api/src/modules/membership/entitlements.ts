import type { Prisma } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { benefitInput, discountPrice, type entitlementKeys } from './contracts.js';
import { ApiError } from '../../errors/api-error.js';
export type EntitlementKey = typeof entitlementKeys[number];
export async function membershipAccess(db: Prisma.TransactionClient, env: Environment, userId: string) {
  const now = new Date();
  return db.subscription.findFirst({ where: { userId, provider: env.PAYMENT_MODE === 'development' && ['development', 'test'].includes(env.APP_ENV) && env.NODE_ENV !== 'production' ? { in: ['development', 'razorpay'] } : 'razorpay',
    OR: [{ status: { in: ['ACTIVE', 'CANCELLED'] }, periodEnd: { gt: now } }, { status: { in: ['ACTIVE', 'PAST_DUE'] }, cancelAtPeriodEnd: false, graceEnd: { gt: now } }] }, include: { plan: { select: { name: true } } } });
}
export async function benefitsFor(db: Prisma.TransactionClient, env: Environment, userId: string) {
  const sub = await membershipAccess(db, env, userId);
  const parsed = benefitInput.array().safeParse(sub?.benefits ?? []);
  return parsed.success ? parsed.data : [];
}
export async function entitled(db: Prisma.TransactionClient, env: Environment, userId: string, key: EntitlementKey, resourceId?: string) {
  const benefit = (await benefitsFor(db, env, userId)).find(b => b.key === key);
  if (!benefit) return false;
  // Program/product access is an explicit allowlist; empty never means all paid content.
  return resourceId ? benefit.resourceIds.includes(resourceId) : true;
}
export async function requireEntitlement(db: Prisma.TransactionClient, env: Environment, userId: string, key: EntitlementKey, resourceId?: string) {
  if (!await entitled(db, env, userId, key, resourceId)) throw new ApiError(403, 'MEMBERSHIP_REQUIRED', 'This benefit is available with a configured Pocket Doctor membership. Explore Membership for plan details.');
}
export async function memberPrice(db: Prisma.TransactionClient, env: Environment, userId: string, key: EntitlementKey, base: number, resourceId: string) {
  const benefit = (await benefitsFor(db, env, userId)).find(b => b.key === key && b.resourceIds.includes(resourceId));
  return benefit ? discountPrice(base, 'PERCENT', benefit.value) : base;
}
