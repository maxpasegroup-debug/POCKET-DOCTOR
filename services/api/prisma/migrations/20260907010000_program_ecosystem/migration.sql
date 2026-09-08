-- CreateEnum
CREATE TYPE "ProgramType" AS ENUM ('RECORDED', 'LIVE');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ENROLLED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateTable
CREATE TABLE "Doctor" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "qualification" VARCHAR(200) NOT NULL,
    "specialty" VARCHAR(100) NOT NULL,
    "experienceYears" INTEGER,
    "biography" TEXT NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Doctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramCategory" (
    "id" VARCHAR(60) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "interest" VARCHAR(100),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgramCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "outcomes" TEXT[],
    "coverUrl" TEXT,
    "type" "ProgramType" NOT NULL,
    "level" VARCHAR(40) NOT NULL DEFAULT 'Beginner',
    "durationMinutes" INTEGER NOT NULL,
    "pricePaise" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doctorId" UUID NOT NULL,
    "categoryId" VARCHAR(60) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramModule" (
    "id" UUID NOT NULL,
    "programId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ProgramModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" UUID NOT NULL,
    "moduleId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "mediaRef" TEXT,
    "keyPoints" TEXT[],
    "supportingMaterial" TEXT NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramEnrollment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "programId" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ENROLLED',
    "enrolledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ProgramEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "enrollmentId" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "positionSeconds" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("enrollmentId","lessonId")
);

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" UUID NOT NULL,
    "programId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "information" TEXT NOT NULL,
    "providerRef" TEXT,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentPayment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "programId" UUID NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMPTZ(3),

    CONSTRAINT "EnrollmentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramCategory_name_key" ON "ProgramCategory"("name");

-- CreateIndex
CREATE INDEX "Program_published_categoryId_type_idx" ON "Program"("published", "categoryId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramModule_programId_position_key" ON "ProgramModule"("programId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_moduleId_position_key" ON "Lesson"("moduleId", "position");

-- CreateIndex
CREATE INDEX "ProgramEnrollment_userId_status_idx" ON "ProgramEnrollment"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramEnrollment_userId_programId_key" ON "ProgramEnrollment"("userId", "programId");

-- CreateIndex
CREATE INDEX "LiveSession_programId_startsAt_idx" ON "LiveSession"("programId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentPayment_providerReference_key" ON "EnrollmentPayment"("providerReference");

-- CreateIndex
CREATE INDEX "EnrollmentPayment_userId_programId_status_idx" ON "EnrollmentPayment"("userId", "programId", "status");

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProgramCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramModule" ADD CONSTRAINT "ProgramModule_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "ProgramModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramEnrollment" ADD CONSTRAINT "ProgramEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramEnrollment" ADD CONSTRAINT "ProgramEnrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ProgramEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentPayment" ADD CONSTRAINT "EnrollmentPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentPayment" ADD CONSTRAINT "EnrollmentPayment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
