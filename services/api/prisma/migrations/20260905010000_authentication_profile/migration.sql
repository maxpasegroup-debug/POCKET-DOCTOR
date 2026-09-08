ALTER TABLE "User" ADD COLUMN "phone" VARCHAR(16),
ADD COLUMN "fullName" VARCHAR(100),
ADD COLUMN "language" VARCHAR(5) NOT NULL DEFAULT 'en',
ADD COLUMN "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "profileCompletedAt" TIMESTAMPTZ(3),
ADD COLUMN "notifications" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

CREATE TABLE "OtpChallenge" (
  "id" UUID NOT NULL PRIMARY KEY,
  "phone" VARCHAR(16) NOT NULL,
  "codeHash" VARCHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "requestedAt" TIMESTAMPTZ(3) NOT NULL,
  "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 1,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumed" BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX "OtpChallenge_phone_key" ON "OtpChallenge"("phone");

CREATE TABLE "Session" (
  "id" UUID NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "tokenHash" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
