import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export interface Database {
  readonly client?: PrismaClient;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export function createDatabase(url: string): Database {
  const adapter = new PrismaPg({
    connectionString: url,
    // Prisma serializes date parameters in UTC. Keep PostgreSQL interpretation
    // consistent with worker SQL now(), regardless of the host's local timezone.
    options: '-c timezone=UTC',
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
    statement_timeout: 3000,
    max: 5,
  });
  const prisma = new PrismaClient({ adapter });
  return {
    client: prisma,
    async ping() { await prisma.$queryRaw`SELECT 1`; },
    async close() { await prisma.$disconnect(); },
  };
}
