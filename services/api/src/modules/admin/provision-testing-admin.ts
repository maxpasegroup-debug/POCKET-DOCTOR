import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Environment } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// Operator-only utility. Never exposed through an HTTP endpoint or startup hook.
export async function provisionTestingAdmin(db: PrismaClient, env: Environment, input: { phone: string; userId: string }) {
  if (env.APP_ENV !== 'staging' || env.NODE_ENV !== 'production' || env.OTP_MODE !== 'testing' || env.ADMIN_SECURITY_MODE !== 'totp') {
    throw new Error('Administrator provisioning requires staging testing mode with TOTP.');
  }
  if (!/^\+91[6-9][0-9]{9}$/.test(input.phone) || !z.string().uuid().safeParse(input.userId).success) throw new Error('Invalid operator input.');
  const hash = createHash('sha256').update(input.phone).digest('hex');
  if (JSON.parse(env.OTP_TEST_ACCOUNTS)[hash] !== 'ADMIN' || !/^[A-Z2-7]{32,128}$/.test(JSON.parse(env.ADMIN_TOTP_KEYS)[input.userId] ?? '')) {
    throw new Error('Configure the exact Admin test identity and its authenticator before provisioning.');
  }
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.phone}))::text`;
    const existing = await tx.user.findUnique({ where: { phone: input.phone }, include: { roles: true } });
    if (existing) {
      if (existing.id !== input.userId || existing.accountStatus !== 'ACTIVE' || existing.roles.length !== 1 || existing.roles[0]?.role !== 'ADMIN') {
        throw new Error('Identity conflict: refusing to promote, replace, or reactivate an existing account.');
      }
      return 'existing' as const;
    }
    await tx.user.create({ data: { id: input.userId, phone: input.phone, fullName: 'Staging Test Administrator', roles: { create: { role: 'ADMIN' } } } });
    await tx.adminAuditEvent.create({ data: { actorId: null, action: 'OPERATOR_PROVISION_STAGING_ADMIN', resourceId: input.userId, requestId: randomUUID(), result: 'SUCCEEDED' } });
    return 'created' as const;
  });
}
