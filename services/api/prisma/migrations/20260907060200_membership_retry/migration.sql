ALTER TABLE "EnrollmentPayment" ADD COLUMN "requestKey" UUID;
CREATE UNIQUE INDEX "EnrollmentPayment_userId_requestKey_key" ON "EnrollmentPayment"("userId", "requestKey");
