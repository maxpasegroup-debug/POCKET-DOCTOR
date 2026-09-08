import type { PrismaClient } from '../../generated/prisma/client.js';

export const notificationText: Record<string, string> = {
  membership: 'There is an update to your membership.', appointment: 'There is an update to your appointment.',
  payment: 'A payment receipt is available.', order: 'There is an update to your wellness order.',
  program: 'Your program activity has been updated.', account: 'There is an important account update.',
};
// Existing domain events feed one inbox. A transaction makes materialization and
// source acknowledgement atomic; unique sourceKey makes repeated worker runs safe.
export async function collectNotifications(db: PrismaClient) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(770007)`;
    let collected = 0;
    async function add(userId: string, sourceKey: string, kind: string, route: string) {
      await tx.notification.upsert({ where: { sourceKey }, create: { userId, sourceKey, kind, route }, update: {} }); collected++;
    }
    const membership = await tx.subscriptionEvent.findMany({ where: { notificationPending: true }, include: { subscription: { select: { userId: true } } }, orderBy: { createdAt: 'asc' }, take: 50 });
    for (const e of membership) { await add(e.subscription.userId, `membership:${e.id}`, 'membership', '/membership/manage'); await tx.subscriptionEvent.update({ where: { id: e.id }, data: { notificationPending: false } }); }
    const reminders = await tx.consultationReminder.findMany({ where: { status: 'PENDING', dueAt: { lte: new Date() } }, include: { consultation: { select: { userId: true, status: true, startsAt: true } } }, orderBy: { dueAt: 'asc' }, take: 50 });
    for (const e of reminders) {
      if (e.consultation.status === 'CONFIRMED' && e.consultation.startsAt > new Date()) await add(e.consultation.userId, `appointment:${e.id}`, 'appointment', '/my-consultations');
      await tx.consultationReminder.update({ where: { id: e.id }, data: { status: 'PROCESSED' } });
    }
    const receipts = await tx.$queryRaw<{ id: string; userId: string }[]>`SELECT i."id", p."userId" FROM "Invoice" i JOIN "EnrollmentPayment" p ON p."id"=i."paymentId"
      WHERE NOT EXISTS (SELECT 1 FROM "Notification" n WHERE n."sourceKey"='payment:' || i."id"::text) ORDER BY i."issuedAt" LIMIT 50`;
    for (const e of receipts) await add(e.userId, `payment:${e.id}`, 'payment', `/membership/invoices/${e.id}`);
    const orders = await tx.$queryRaw<{ id: string; userId: string; orderId: string }[]>`SELECT e."id", o."userId", e."orderId" FROM "OrderEvent" e JOIN "Order" o ON o."id"=e."orderId"
      WHERE NOT EXISTS (SELECT 1 FROM "Notification" n WHERE n."sourceKey"='order:' || e."id"::text) ORDER BY e."createdAt" LIMIT 50`;
    for (const e of orders) await add(e.userId, `order:${e.id}`, 'order', `/orders/${e.orderId}`);
    const enrollments = await tx.$queryRaw<{ id: string; userId: string; programId: string; status: string }[]>`SELECT e."id", e."userId", e."programId", e."status"::text FROM "ProgramEnrollment" e
      WHERE NOT EXISTS (SELECT 1 FROM "Notification" n WHERE n."sourceKey"='program:' || e."id"::text || ':' || e."status"::text) ORDER BY e."enrolledAt" LIMIT 50`;
    for (const e of enrollments) await add(e.userId, `program:${e.id}:${e.status}`, 'program', `/programs/${e.programId}`);
    const appointments = await tx.$queryRaw<{ id: string; userId: string; status: string }[]>`SELECT c."id",c."userId",c."status"::text FROM "Consultation" c WHERE c."status" IN ('CONFIRMED','CANCELLED','COMPLETED')
      AND NOT EXISTS (SELECT 1 FROM "Notification" n WHERE n."sourceKey"='consultation:' || c."id"::text || ':' || c."status"::text) ORDER BY c."createdAt" LIMIT 50`;
    for (const e of appointments) await add(e.userId, `consultation:${e.id}:${e.status}`, 'appointment', '/my-consultations');
    return { collected };
  }, { timeout: 15000 });
}
