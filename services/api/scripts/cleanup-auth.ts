import 'dotenv/config';
import { createDatabase } from '../src/database/database.js';
import { readEnvironment } from '../src/config/env.js';

const env = readEnvironment();
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const database = createDatabase(env.DATABASE_URL);
try {
  // Keep phone cooldown state for one hour; retain no old OTP material afterward.
  await database.client!.otpChallenge.deleteMany({ where: { requestedAt: { lt: new Date(Date.now() - 3600000) } } });
  await database.client!.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  console.log('Expired authentication records removed.');
} finally { await database.close(); }
