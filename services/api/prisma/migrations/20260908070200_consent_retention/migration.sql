-- Retain pseudonymous consent evidence independently of later approved identity erasure.
-- The append-only trigger remains in force. User-facing routes enforce ownership.
ALTER TABLE "ConsentRecord" DROP CONSTRAINT "ConsentRecord_userId_fkey";
