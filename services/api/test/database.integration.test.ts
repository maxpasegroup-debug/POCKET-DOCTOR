import test from 'node:test';
import { createDatabase } from '../src/database/database.js';

test('configured PostgreSQL responds through Prisma', { skip: !process.env.DATABASE_URL }, async () => {
  const database = createDatabase(process.env.DATABASE_URL!);
  try { await database.ping(); } finally { await database.close(); }
});
