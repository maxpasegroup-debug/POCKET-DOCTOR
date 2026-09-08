-- CreateTable
CREATE TABLE "AIConversation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "prompt" VARCHAR(2000) NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMemory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "text" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AIMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessGoal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "target" VARCHAR(120) NOT NULL,
    "startDate" DATE NOT NULL,
    "targetDate" DATE,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WellnessGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessCheckIn" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "mood" VARCHAR(30) NOT NULL,
    "energy" INTEGER NOT NULL,
    "sleepHours" DOUBLE PRECISION,
    "waterMl" INTEGER,
    "activityMinutes" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "habitCompleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WellnessCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIPreferences" (
    "userId" UUID NOT NULL,
    "providerConsent" BOOLEAN NOT NULL DEFAULT false,
    "useMemory" BOOLEAN NOT NULL DEFAULT false,
    "appReminders" BOOLEAN NOT NULL DEFAULT false,
    "whatsappReminders" BOOLEAN NOT NULL DEFAULT false,
    "programReminders" BOOLEAN NOT NULL DEFAULT false,
    "consultationReminders" BOOLEAN NOT NULL DEFAULT false,
    "wellnessReminders" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AIPreferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "WhatsAppIdentity" (
    "userId" UUID NOT NULL,
    "waId" VARCHAR(20) NOT NULL,
    "linkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInboundAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppIdentity_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "WhatsAppLinkToken" (
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "candidateWaId" VARCHAR(20),

    CONSTRAINT "WhatsAppLinkToken_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AIAuditEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "event" VARCHAR(40) NOT NULL,
    "classification" VARCHAR(30),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppReceipt" (
    "id" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIConversation_userId_updatedAt_idx" ON "AIConversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AIMessage_conversationId_createdAt_idx" ON "AIMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIMessage_conversationId_requestKey_key" ON "AIMessage"("conversationId", "requestKey");

-- CreateIndex
CREATE INDEX "AIMemory_userId_idx" ON "AIMemory"("userId");

-- CreateIndex
CREATE INDEX "WellnessGoal_userId_status_idx" ON "WellnessGoal"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WellnessCheckIn_userId_date_key" ON "WellnessCheckIn"("userId", "date");

-- CreateIndex
CREATE INDEX "Reminder_userId_completed_dueAt_idx" ON "Reminder"("userId", "completed", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppIdentity_waId_key" ON "WhatsAppIdentity"("waId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppLinkToken_tokenHash_key" ON "WhatsAppLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AIAuditEvent_userId_createdAt_idx" ON "AIAuditEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMemory" ADD CONSTRAINT "AIMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessGoal" ADD CONSTRAINT "WellnessGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessCheckIn" ADD CONSTRAINT "WellnessCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIPreferences" ADD CONSTRAINT "AIPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppIdentity" ADD CONSTRAINT "WhatsAppIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppLinkToken" ADD CONSTRAINT "WhatsAppLinkToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAuditEvent" ADD CONSTRAINT "AIAuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
