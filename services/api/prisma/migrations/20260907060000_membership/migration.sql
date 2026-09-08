-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'PAYMENT_FAILED');

-- CreateEnum
CREATE TYPE "RevenueSource" AS ENUM ('MEMBERSHIP', 'PROGRAM', 'CONSULTATION', 'WELLNESS');

-- AlterTable
ALTER TABLE "EnrollmentPayment" ADD COLUMN     "subscriptionId" UUID;

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "interval" "BillingInterval" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipBenefit" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "resourceIds" UUID[],
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MembershipBenefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "pricePaise" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "benefits" JSONB NOT NULL,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "provider" VARCHAR(30) NOT NULL,
    "requestKey" UUID NOT NULL,
    "periodStart" TIMESTAMPTZ(3),
    "periodEnd" TIMESTAMPTZ(3),
    "graceEnd" TIMESTAMPTZ(3),
    "pendingUntil" TIMESTAMPTZ(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMPTZ(3),
    "trialUsed" BOOLEAN NOT NULL DEFAULT false,
    "isTrial" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionEvent" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "kind" VARCHAR(50) NOT NULL,
    "notificationPending" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "value" INTEGER NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "usageLimit" INTEGER NOT NULL,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "introductory" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponPlan" (
    "couponId" UUID NOT NULL,
    "planId" UUID NOT NULL,

    CONSTRAINT "CouponPlan_pkey" PRIMARY KEY ("couponId","planId")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" UUID NOT NULL,
    "couponId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "basePaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL,
    "reservedUntil" TIMESTAMPTZ(3) NOT NULL,
    "redeemedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "paymentId" UUID NOT NULL,
    "source" "RevenueSource" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "taxPaise" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'RECEIPT',
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_slug_key" ON "MembershipPlan"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipBenefit_planId_key_key" ON "MembershipBenefit"("planId", "key");

-- CreateIndex
CREATE INDEX "Subscription_userId_createdAt_idx" ON "Subscription"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Subscription_status_periodEnd_idx" ON "Subscription"("status", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_requestKey_key" ON "Subscription"("userId", "requestKey");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_subscriptionId_createdAt_idx" ON "SubscriptionEvent"("subscriptionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_paymentId_key" ON "CouponRedemption"("paymentId");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_userId_idx" ON "CouponRedemption"("couponId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_paymentId_key" ON "Invoice"("paymentId");

-- CreateIndex
CREATE INDEX "Invoice_source_issuedAt_idx" ON "Invoice"("source", "issuedAt");

-- CreateIndex
CREATE INDEX "EnrollmentPayment_subscriptionId_status_idx" ON "EnrollmentPayment"("subscriptionId", "status");

-- AddForeignKey
ALTER TABLE "MembershipBenefit" ADD CONSTRAINT "MembershipBenefit_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponPlan" ADD CONSTRAINT "CouponPlan_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponPlan" ADD CONSTRAINT "CouponPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "EnrollmentPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "EnrollmentPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentPayment" ADD CONSTRAINT "EnrollmentPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnrollmentPayment" DROP CONSTRAINT "payment_one_target";
ALTER TABLE "EnrollmentPayment" ADD CONSTRAINT "payment_one_target" CHECK (num_nonnulls("programId", "consultationId", "orderId", "subscriptionId") = 1);
CREATE UNIQUE INDEX "one_open_membership_per_user" ON "Subscription" ("userId") WHERE "status" IN ('PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED');
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "membership_plan_values" CHECK ("pricePaise" >= 100 AND "trialDays" BETWEEN 0 AND 30 AND "graceDays" BETWEEN 0 AND 14);
ALTER TABLE "Subscription" ADD CONSTRAINT "subscription_values" CHECK ("pricePaise" >= 0 AND ("periodEnd" IS NULL OR "periodEnd" > "periodStart"));
ALTER TABLE "Coupon" ADD CONSTRAINT "coupon_values" CHECK ("usageLimit" > 0 AND "perUserLimit" > 0 AND "endsAt" > "startsAt" AND "value" > 0 AND (("type" = 'PERCENT' AND "value" <= 100) OR "type" = 'FIXED'));
ALTER TABLE "Program" ADD COLUMN "membershipOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WellnessProduct" ADD COLUMN "membershipOnly" BOOLEAN NOT NULL DEFAULT false;

-- Revenue is the existing payment ledger, not a second money ledger. A verified
-- transition creates a single receipt atomically for every service domain.
CREATE FUNCTION "create_payment_receipt"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'VERIFIED' THEN
    INSERT INTO "Invoice" ("id", "number", "paymentId", "source", "amountPaise", "currency", "issuedAt")
    VALUES (gen_random_uuid(), 'PD-' || NEW."id"::text, NEW."id",
      CASE WHEN NEW."subscriptionId" IS NOT NULL THEN 'MEMBERSHIP' WHEN NEW."programId" IS NOT NULL THEN 'PROGRAM'
        WHEN NEW."consultationId" IS NOT NULL THEN 'CONSULTATION' ELSE 'WELLNESS' END::"RevenueSource",
      NEW."amountPaise", NEW."currency", COALESCE(NEW."verifiedAt", now())) ON CONFLICT ("paymentId") DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "payment_receipt" AFTER INSERT OR UPDATE OF "status" ON "EnrollmentPayment" FOR EACH ROW EXECUTE FUNCTION "create_payment_receipt"();
INSERT INTO "Invoice" ("id", "number", "paymentId", "source", "amountPaise", "currency", "issuedAt")
SELECT gen_random_uuid(), 'PD-' || "id"::text, "id",
  CASE WHEN "programId" IS NOT NULL THEN 'PROGRAM' WHEN "consultationId" IS NOT NULL THEN 'CONSULTATION' ELSE 'WELLNESS' END::"RevenueSource",
  "amountPaise", "currency", COALESCE("verifiedAt", "createdAt") FROM "EnrollmentPayment" WHERE "status" = 'VERIFIED';
