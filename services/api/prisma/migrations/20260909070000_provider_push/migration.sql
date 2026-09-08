CREATE TABLE "PushDevice" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "tokenEncrypted" TEXT NOT NULL,
  "platform" VARCHAR(10) NOT NULL CHECK ("platform" IN ('android','ios','web')),
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PushDevice_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PushDevice_sessionId_key" ON "PushDevice"("sessionId");
CREATE UNIQUE INDEX "PushDevice_tokenHash_key" ON "PushDevice"("tokenHash");
CREATE INDEX "PushDevice_userId_idx" ON "PushDevice"("userId");
ALTER TABLE "Notification" ADD COLUMN "pushDeviceId" UUID;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_pushDeviceId_fkey" FOREIGN KEY ("pushDeviceId") REFERENCES "PushDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
