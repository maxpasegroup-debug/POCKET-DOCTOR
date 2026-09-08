import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { WhatsAppNotificationProvider } from './whatsapp-provider.js';

export async function deliverNotifications(db: PrismaClient, env: Environment, provider = new WhatsAppNotificationProvider(env)) {
  if (env.WHATSAPP_OUTBOUND !== 'cloud') return { attempted: 0, configured: false };
  // Only recent source events are eligible; never deliver a backlog on opt-in.
  const sources = await db.$queryRaw<{ userId: string; sourceKey: string; kind: string; route: string }[]>`SELECT n."userId",n."sourceKey",n."kind",n."route" FROM "Notification" n
    JOIN "User" u ON u."id"=n."userId" JOIN "AIPreferences" p ON p."userId"=u."id" JOIN "WhatsAppIdentity" w ON w."userId"=u."id"
    WHERE n."channel"='IN_APP' AND n."createdAt">=now()-interval '1 hour' AND u."accountStatus"='ACTIVE' AND u."notifications"=true AND p."whatsappReminders"=true
    AND NOT EXISTS (SELECT 1 FROM "Notification" other WHERE other."sourceKey"=n."sourceKey" || ':wa') ORDER BY n."createdAt" LIMIT 50`;
  for (const n of sources) await db.notification.upsert({ where: { sourceKey: `${n.sourceKey}:wa` }, create: { userId: n.userId, sourceKey: `${n.sourceKey}:wa`, kind: n.kind, route: n.route, channel: 'WHATSAPP', status: 'PENDING' }, update: {} });
  // An abandoned send may have reached Meta. Keep it visible; do not resend blindly.
  await db.notification.updateMany({ where: { channel: 'WHATSAPP', status: 'SENDING', nextAttemptAt: { lt: new Date() } }, data: { status: 'UNKNOWN', lastError: 'WORKER_INTERRUPTED' } });
  let attempted = 0;
  for (let index = 0; index < 20; index++) {
    const next = await db.$transaction(async tx => {
      const ids = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Notification" WHERE "channel"='WHATSAPP' AND "status" IN ('PENDING','FAILED') AND "providerReference" IS NULL AND "attempts"<3 AND "nextAttemptAt"<=now() ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!ids[0]) return null;
      return tx.notification.update({ where: { id: ids[0].id }, data: { status: 'SENDING', attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 60000) } });
    });
    if (!next) break;
    const user = await db.user.findUnique({ where: { id: next.userId }, include: { aiPreferences: true, whatsappIdentity: true } });
    const consent = await db.consentRecord.findFirst({ where: { userId: next.userId, type: 'WHATSAPP' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    const kindAllowed = next.kind === 'program' ? user?.aiPreferences?.programReminders === true
      : next.kind === 'appointment' ? user?.aiPreferences?.consultationReminders === true : true;
    const permitted = !!user && user.accountStatus === 'ACTIVE' && user.notifications && user.aiPreferences?.whatsappReminders === true && consent?.granted === true && kindAllowed;
    const result = await provider.send(user?.whatsappIdentity?.waId ?? '', user?.whatsappIdentity?.lastInboundAt ?? new Date(0), permitted);
    await db.notification.update({ where: { id: next.id }, data: result.status === 'SENT' ? { status: 'SENT', providerReference: result.reference, lastError: null } :
      { status: result.status === 'FAILED' && next.attempts >= 3 ? 'DEAD_LETTER' : result.status, lastError: result.reason, nextAttemptAt: new Date(Date.now() + 60000 * 2 ** next.attempts) } });
    attempted++;
  }
  return { attempted, configured: true };
}
