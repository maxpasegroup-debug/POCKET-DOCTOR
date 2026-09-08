CREATE TABLE "RequestBudget" ("key" VARCHAR(64) PRIMARY KEY, "count" INTEGER NOT NULL CHECK ("count">0), "expiresAt" TIMESTAMPTZ(3) NOT NULL);
CREATE INDEX "RequestBudget_expiresAt_idx" ON "RequestBudget"("expiresAt");
