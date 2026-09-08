import { z } from 'zod';
export const entitlementKeys = ['PROGRAM_ACCESS', 'MEMBER_PROGRAMS', 'CONSULTATION_DISCOUNT', 'WELLNESS_MEMBER_PRICING', 'MEMBER_PRODUCTS', 'AI_WELLNESS_FEATURES', 'PERSONAL_TRACKING', 'MEMBER_OFFERS'] as const;
export const benefitInput = z.object({ key: z.enum(entitlementKeys), label: z.string().trim().min(1).max(160), resourceIds: z.array(z.string().uuid()).max(100).default([]), value: z.number().int().min(0).max(100).default(0) }).strict();
export const planInput = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,60}$/), name: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(500), pricePaise: z.number().int().min(100).max(10000000), currency: z.literal('INR').default('INR'), interval: z.enum(['MONTH', 'YEAR']), active: z.boolean().default(false), isDemo: z.boolean().default(true), trialDays: z.number().int().min(0).max(30).default(0), graceDays: z.number().int().min(0).max(14).default(0), position: z.number().int().min(0).max(100).default(0), benefits: z.array(benefitInput).max(30) }).strict();
export const couponInput = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,40}$/), type: z.enum(['PERCENT', 'FIXED']), value: z.number().int().min(1).max(10000000), startsAt: z.iso.datetime().transform(v => new Date(v)), endsAt: z.iso.datetime().transform(v => new Date(v)), usageLimit: z.number().int().min(1).max(100000), perUserLimit: z.number().int().min(1).max(100).default(1), planIds: z.array(z.string().uuid()).min(1).max(100), active: z.boolean().default(false), introductory: z.boolean().default(false) }).strict().refine(v => v.endsAt > v.startsAt && (v.type !== 'PERCENT' || v.value <= 100));
export const checkoutInput = z.object({ planId: z.string().uuid(), coupon: z.string().trim().toUpperCase().max(40).default('') }).strict();
export const subscribeInput = checkoutInput.extend({ requestKey: z.string().uuid(), trial: z.boolean().default(false), renew: z.boolean().default(false) });
export function discountPrice(base: number, type: string, value: number) {
  return Math.max(0, base - (type === 'PERCENT' ? Math.floor(base * value / 100) : value));
}
// Calendar billing, clamped to the final day of the target month (UTC).
export function periodEnd(start: Date, interval: string) {
  const result = new Date(start); const day = result.getUTCDate(); result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + (interval === 'YEAR' ? 12 : 1));
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, last)); return result;
}

// Matches the existing small, process-local product analytics foundation.
// Contains counts only; never a user identifier, prompt or health field.
export class MembershipAnalytics {
  private viewed = 0;
  recordView() { this.viewed++; }
  snapshot() { return { membership_viewed: this.viewed }; }
}
