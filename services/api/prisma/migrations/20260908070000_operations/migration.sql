-- AlterEnum
-- Additive migration. Snapshot/restore rehearsal and explicit operator release approval required.
ALTER TYPE "DoctorVerification" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountStatus" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "archivedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "AdminAuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(160) NOT NULL,
    "resourceId" VARCHAR(80),
    "requestId" VARCHAR(80) NOT NULL,
    "result" VARCHAR(30) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminElevation" (
    "sessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdminElevation_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "AdminMfaCounter" (
    "userId" UUID NOT NULL,
    "counter" BIGINT NOT NULL,

    CONSTRAINT "AdminMfaCounter_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "version" VARCHAR(40) NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sourceKey" VARCHAR(160) NOT NULL,
    "kind" VARCHAR(50) NOT NULL,
    "route" VARCHAR(180) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(3),
    "channel" VARCHAR(20) NOT NULL DEFAULT 'IN_APP',
    "status" VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerReference" VARCHAR(160),
    "lastError" VARCHAR(40),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderEvent" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "eventId" VARCHAR(160) NOT NULL,
    "kind" VARCHAR(60) NOT NULL,
    "reference" VARCHAR(160) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
    "requestId" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditEvent_createdAt_id_idx" ON "AdminAuditEvent"("createdAt", "id");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_actorId_createdAt_idx" ON "AdminAuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminElevation_expiresAt_idx" ON "AdminElevation"("expiresAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_type_createdAt_idx" ON "ConsentRecord"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "PrivacyRequest_userId_createdAt_idx" ON "PrivacyRequest"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_sourceKey_key" ON "Notification"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_providerReference_key" ON "Notification"("providerReference");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_id_idx" ON "Notification"("userId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Notification_status_nextAttemptAt_idx" ON "Notification"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ProviderEvent_status_createdAt_idx" ON "ProviderEvent"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderEvent_provider_eventId_key" ON "ProviderEvent"("provider", "eventId");

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "user_account_status_valid" CHECK ("accountStatus" IN ('ACTIVE','DEACTIVATED','SUSPENDED','DELETION_REQUESTED'));
ALTER TABLE "Notification" ADD CONSTRAINT "notification_attempts_nonnegative" CHECK ("attempts" >= 0);
CREATE FUNCTION pocket_doctor_protect_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit records are append-only'; END;
$$;
CREATE TRIGGER protect_admin_audit BEFORE UPDATE OR DELETE ON "AdminAuditEvent"
FOR EACH ROW EXECUTE FUNCTION pocket_doctor_protect_audit();
CREATE TRIGGER protect_consent_evidence BEFORE UPDATE OR DELETE ON "ConsentRecord"
FOR EACH ROW EXECUTE FUNCTION pocket_doctor_protect_audit();
