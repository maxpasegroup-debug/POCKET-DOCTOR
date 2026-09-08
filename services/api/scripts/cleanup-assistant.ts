import 'dotenv/config';
import { createDatabase } from '../src/database/database.js';
import { readEnvironment } from '../src/config/env.js';

const env = readEnvironment();
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const database = createDatabase(env.DATABASE_URL);
try {
  const db = database.client!;
  const links = await db.whatsAppLinkToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  // Receipts outlive the accepted inbound window. Audit records contain metadata
  // only; ordinary chat and memory deletion remain explicitly user controlled.
  const receipts = await db.whatsAppReceipt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 8 * 86400000) } } });
  const audit = await db.aIAuditEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86400000) } } });
  console.log({ expiredLinks: links.count, oldReceipts: receipts.count, oldAuditMetadata: audit.count });
} finally { await database.close(); }
