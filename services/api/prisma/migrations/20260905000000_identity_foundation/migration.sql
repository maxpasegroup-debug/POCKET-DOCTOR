CREATE TYPE "Role" AS ENUM ('USER', 'DOCTOR', 'ADMIN');

CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId", "role")
);

ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
