import 'dotenv/config';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { readEnvironment } from '../src/config/env.js';

async function main() {
  const env = readEnvironment(); if (!env.DATABASE_URL || !process.env.BACKUP_FILE) throw new Error('Backup configuration required');
  const url = new URL(env.DATABASE_URL), destination = resolve(process.env.BACKUP_FILE);
  if (existsSync(destination)) throw new Error('Choose a new backup file');
  // Credentials stay out of command-line arguments and logs. Match pg_dump major
  // version to the deployed PostgreSQL server. Operator provides encrypted storage.
  const executable = process.env.PG_DUMP_PATH || 'pg_dump';
  const child = spawn(executable, ['--format=custom', '--no-owner', '--no-acl', '--file', destination], {
    env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: url.pathname.slice(1), PGSSLMODE: url.searchParams.get('sslmode') || 'prefer', PGCONNECT_TIMEOUT: '10' },
    stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true,
  });
  const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  if (code !== 0) throw new Error('Database backup failed');
  console.log('Database backup created. Verify restore and encrypted off-host retention before relying on it.');
}
main().catch(() => { console.error('Backup failed. Check configuration, storage and matching PostgreSQL tools.'); process.exitCode = 1; });
