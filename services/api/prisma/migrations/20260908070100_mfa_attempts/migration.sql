ALTER TABLE "AdminMfaCounter" ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "windowStartedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AdminMfaCounter" ADD CONSTRAINT "mfa_attempts_nonnegative" CHECK ("failedAttempts" >= 0);
