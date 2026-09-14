import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createDatabase } from '../src/database/database.js';

// Read-only release check. Use the migration/audit identity: runtime roles should
// not be granted access to Prisma's migration history just for this command.
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Configuration required');
  const database = createDatabase(process.env.DATABASE_URL);
  try {
    const rows = await database.client!.$queryRaw<Array<{
      migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null;
    }>>`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"`;
    const directory = new URL('../prisma/migrations/', import.meta.url);
    const files = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory());
    const applied = rows.filter(row => row.finished_at && !row.rolled_back_at);
    let matched = 0;
    for (const file of files) {
      const checksum = createHash('sha256').update(await readFile(new URL(`${file.name}/migration.sql`, directory))).digest('hex');
      if (applied.filter(row => row.migration_name === file.name && row.checksum === checksum).length === 1) matched++;
    }
    const unfinished = rows.filter(row => !row.finished_at && !row.rolled_back_at).length;
    const ok = matched === files.length && applied.length === files.length && unfinished === 0;
    console.log(JSON.stringify({ status: ok ? 'PASS' : 'FAIL', files: files.length, applied: applied.length, matched, unfinished, readOnly: true }));
    if (!ok) process.exitCode = 1;
  } finally { await database.close(); }
}

main().catch(() => {
  console.error('Migration audit failed; check database configuration, permissions and migration history. No changes were made.');
  process.exitCode = 1;
});
