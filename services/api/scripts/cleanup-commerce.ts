import 'dotenv/config';
import { createDatabase } from '../src/database/database.js';
import { readEnvironment } from '../src/config/env.js';
import { CommerceService } from '../src/modules/wellness/commerce-service.js';
const env = readEnvironment();
if (!env.DATABASE_URL) throw new Error('Database configuration is required.');
const database = createDatabase(env.DATABASE_URL);
try { await new CommerceService(database.client!, env).cleanup(); console.log('Expired commerce reservations released.'); }
finally { await database.close(); }
