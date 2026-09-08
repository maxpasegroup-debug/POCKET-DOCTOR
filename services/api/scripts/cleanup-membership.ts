import 'dotenv/config';
import { createDatabase } from '../src/database/database.js';
import { readEnvironment } from '../src/config/env.js';
import { MembershipService } from '../src/modules/membership/membership-service.js';
const env = readEnvironment();
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const db = createDatabase(env.DATABASE_URL);
try { console.log({ membershipsUpdated: await new MembershipService(db.client!, env).cleanup() }); }
finally { await db.close(); }
