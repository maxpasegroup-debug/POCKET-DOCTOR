import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readEnvironment } from './config/env.js';
import { createDatabase } from './database/database.js';
import { collectNotifications } from './modules/notifications/service.js';
import { deliverNotifications } from './modules/notifications/delivery.js';
import { MembershipService } from './modules/membership/membership-service.js';
import { CommerceService } from './modules/wellness/commerce-service.js';

async function main() {
  const env = readEnvironment(); if (!env.DATABASE_URL) throw new Error('Database required');
  const db = createDatabase(env.DATABASE_URL); let stopped = false;
  const controller = new AbortController();
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { stopped = true; controller.abort(); });
  try {
    do {
      const requestId = randomUUID();
      try {
        await db.ping();
        await db.client!.requestBudget.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        await db.client!.adminElevation.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        await db.client!.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        await db.client!.otpChallenge.deleteMany({ where: { requestedAt: { lt: new Date(Date.now() - 3600000) } } });
        await new CommerceService(db.client!, env).cleanup();
        await new MembershipService(db.client!, env).cleanup();
        const collected = await collectNotifications(db.client!);
        // No external sending occurs unless explicitly configured and consented.
        const delivery = await deliverNotifications(db.client!, env);
        console.log(JSON.stringify({ event: 'worker_cycle', requestId, collected: collected.collected, attempted: delivery.attempted }));
      } catch { console.error(JSON.stringify({ event: 'worker_cycle_failed', requestId })); if (process.argv.includes('--once')) process.exitCode = 1; }
      if (process.argv.includes('--once') || stopped) break;
      await new Promise<void>(resolve => {
        const finish = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', finish); resolve(); };
        const timer = setTimeout(finish, 30000); controller.signal.addEventListener('abort', finish, { once: true });
        if (controller.signal.aborted) finish();
      });
    } while (!stopped);
  } finally { await db.close(); }
}
main().catch(() => { console.error('Worker startup failed; check configuration.'); process.exitCode = 1; });
