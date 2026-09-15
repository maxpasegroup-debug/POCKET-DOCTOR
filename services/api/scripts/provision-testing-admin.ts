import 'dotenv/config';
import { readEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/database/database.js';
import { provisionTestingAdmin } from '../src/modules/admin/provision-testing-admin.js';

// Explicit manual operator command only; never called by build/start/deploy.
try {
  const env = readEnvironment();
  if (!env.DATABASE_URL) throw new Error();
  const database = createDatabase(env.DATABASE_URL);
  try {
    const result = await provisionTestingAdmin(database.client!, env, {
      phone: process.env.TEST_ADMIN_PHONE ?? '', userId: process.env.TEST_ADMIN_USER_ID ?? '',
    });
    console.log(result === 'created' ? 'Staging administrator provisioned.' : 'Staging administrator already provisioned; no changes.');
  } finally { await database.close(); }
} catch {
  // Do not print Prisma errors, input, connection strings, phone numbers or keys.
  console.error('Staging administrator setup refused. Check the documented environment, identity, role and authenticator prerequisites. No existing account is promoted or reactivated.');
  process.exitCode = 1;
}
