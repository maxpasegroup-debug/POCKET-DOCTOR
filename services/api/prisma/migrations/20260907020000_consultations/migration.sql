-- CreateEnum
CREATE TYPE "DoctorVerification" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED');

-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "acceptingAppointments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "consultationMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "feePaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "registrationAuthority" TEXT,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
ADD COLUMN     "userId" UUID,
ADD COLUMN     "verificationStatus" "DoctorVerification" NOT NULL DEFAULT 'PENDING_VERIFICATION';

-- AlterTable
ALTER TABLE "EnrollmentPayment" ADD COLUMN     "consultationId" UUID,
ALTER COLUMN "programId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "DoctorAvailability" (
    "id" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "DoctorAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorAvailabilityException" (
    "id" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "localDate" VARCHAR(10) NOT NULL,

    CONSTRAINT "DoctorAvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "reservedUntil" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'PROVIDER_READY',
    "status" "ConsultationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "feePaise" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "holdExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "refundStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "rescheduledAt" TIMESTAMPTZ(3),

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationNote" (
    "consultationId" UUID NOT NULL,
    "privateNote" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpDate" VARCHAR(10),
    "followUpNote" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ConsultationNote_pkey" PRIMARY KEY ("consultationId")
);

-- CreateTable
CREATE TABLE "ConsultationReminder" (
    "id" UUID NOT NULL,
    "consultationId" UUID NOT NULL,
    "minutesBefore" INTEGER NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "ConsultationReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DoctorAvailability_doctorId_weekday_startMinute_key" ON "DoctorAvailability"("doctorId", "weekday", "startMinute");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorAvailabilityException_doctorId_localDate_key" ON "DoctorAvailabilityException"("doctorId", "localDate");

-- CreateIndex
CREATE INDEX "Consultation_doctorId_startsAt_status_idx" ON "Consultation"("doctorId", "startsAt", "status");

-- CreateIndex
CREATE INDEX "Consultation_userId_startsAt_idx" ON "Consultation"("userId", "startsAt");

-- CreateIndex
CREATE INDEX "Consultation_status_holdExpiresAt_idx" ON "Consultation"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "ConsultationReminder_status_dueAt_idx" ON "ConsultationReminder"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationReminder_consultationId_minutesBefore_key" ON "ConsultationReminder"("consultationId", "minutesBefore");

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_userId_key" ON "Doctor"("userId");

-- CreateIndex
CREATE INDEX "Doctor_verificationStatus_acceptingAppointments_idx" ON "Doctor"("verificationStatus", "acceptingAppointments");

-- CreateIndex
CREATE INDEX "EnrollmentPayment_consultationId_status_idx" ON "EnrollmentPayment"("consultationId", "status");

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentPayment" ADD CONSTRAINT "EnrollmentPayment_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorAvailability" ADD CONSTRAINT "DoctorAvailability_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorAvailabilityException" ADD CONSTRAINT "DoctorAvailabilityException_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationNote" ADD CONSTRAINT "ConsultationNote_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationReminder" ADD CONSTRAINT "ConsultationReminder_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve previously verified real program professionals. Demo verification is
-- an explicit development seed operation and never represents real credentials.
UPDATE "Doctor" SET "verificationStatus" = 'VERIFIED'
WHERE "verifiedAt" IS NOT NULL AND "isDemo" = false;

ALTER TABLE "EnrollmentPayment" ADD CONSTRAINT "payment_one_target"
CHECK (("programId" IS NOT NULL)::int + ("consultationId" IS NOT NULL)::int = 1);
ALTER TABLE "EnrollmentPayment" ADD CONSTRAINT "payment_nonnegative" CHECK ("amountPaise" >= 0);
ALTER TABLE "Doctor" ADD CONSTRAINT "doctor_booking_configuration"
CHECK ("feePaise" >= 0 AND "consultationMinutes" BETWEEN 10 AND 120 AND "bufferMinutes" BETWEEN 0 AND 60);
ALTER TABLE "DoctorAvailability" ADD CONSTRAINT "availability_window"
CHECK ("weekday" BETWEEN 1 AND 7 AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute");
ALTER TABLE "Consultation" ADD CONSTRAINT "consultation_time_and_fee"
CHECK ("startsAt" < "endsAt" AND "endsAt" <= "reservedUntil" AND "feePaise" >= 0);

-- Independent database protection, including overlapping starts and buffer time.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Consultation" ADD CONSTRAINT "doctor_no_overlapping_reservations"
EXCLUDE USING gist ("doctorId" WITH =, tstzrange("startsAt", "reservedUntil", '[)') WITH &&)
WHERE ("status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'));
