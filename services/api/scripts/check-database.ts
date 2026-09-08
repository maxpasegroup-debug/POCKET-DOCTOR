import 'dotenv/config';
import { readEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/database/database.js';

const env = readEnvironment();
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is required for db:check.');
  process.exitCode = 1;
} else {
  const database = createDatabase(env.DATABASE_URL);
  try {
    await database.ping();
    console.log('Database connection verified.');
  } catch {
    console.error('Database connection failed. Check configuration and connectivity.');
    process.exitCode = 1;
  } finally { await database.close(); }
}
