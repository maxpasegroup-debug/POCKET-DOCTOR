ALTER TABLE "OtpChallenge" ADD COLUMN "purpose" VARCHAR(24) NOT NULL DEFAULT 'LOGIN';
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_purpose_check" CHECK ("purpose" IN ('LOGIN', 'DOCTOR_REGISTRATION'));
ALTER TABLE "Doctor"
 ADD COLUMN "registrationStartedAt" TIMESTAMPTZ(3),
 ADD COLUMN "registrationSubmittedAt" TIMESTAMPTZ(3),
 ADD COLUMN "registrationReviewStartedAt" TIMESTAMPTZ(3),
 ADD COLUMN "registrationReviewedAt" TIMESTAMPTZ(3),
 ADD COLUMN "registrationRejectionReason" VARCHAR(2000),
 ADD COLUMN "registrationEmail" VARCHAR(254),
 ADD COLUMN "registrationDateOfBirth" VARCHAR(10),
 ADD COLUMN "registrationGender" VARCHAR(40);
CREATE TABLE "DoctorCredential" (
 "id" UUID NOT NULL, "doctorId" UUID NOT NULL, "kind" VARCHAR(40) NOT NULL,
 "fileName" VARCHAR(120) NOT NULL, "contentType" VARCHAR(40) NOT NULL, "size" INTEGER NOT NULL,
 "objectKey" VARCHAR(200) NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "DoctorCredential_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "DoctorCredential_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DoctorCredential_objectKey_key" ON "DoctorCredential"("objectKey");
CREATE INDEX "DoctorCredential_doctorId_kind_idx" ON "DoctorCredential"("doctorId", "kind");
