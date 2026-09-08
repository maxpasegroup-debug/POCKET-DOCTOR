import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { userDto, type ProfileInput } from './profile.js';
import type { Principal, SessionVerifier } from './contracts.js';

const invalidOtp = () => new ApiError(400, 'INVALID_OTP', 'That code is incorrect or has expired. Please try again or request a new code.');
const unauthorized = () => new ApiError(401, 'UNAUTHENTICATED', 'Please sign in again.');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// The production delivery adapter is deliberately not implemented. Development
// mode issues random per-challenge codes, returned only through an opt-in local API.
export class IdentityService implements SessionVerifier {
  constructor(private readonly prisma: PrismaClient, private readonly env: Environment) {}

  private otpHash(id: string, code: string) {
    return createHmac('sha256', this.env.SESSION_SECRET).update(`${id}:${code}`).digest('hex');
  }

  async requestOtp(phone: string) {
    if (this.env.OTP_MODE !== 'development' || !['development', 'test'].includes(this.env.APP_ENV)) {
      throw new ApiError(503, 'OTP_UNAVAILABLE', 'Sign-in is not available yet. Please try again later.');
    }
    const now = new Date();
    const id = randomUUID();
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    await this.prisma.$transaction(async tx => {
      // Cross-process phone lock serializes first requests as well as resends.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${phone}))::text`;
      const old = await tx.otpChallenge.findUnique({ where: { phone } });
      const sameWindow = old && now.getTime() - old.windowStartedAt.getTime() < 3600000;
      if (old && (now.getTime() - old.requestedAt.getTime() < 60000 || (sameWindow && old.requestCount >= 5))) {
        throw new ApiError(429, 'OTP_RATE_LIMITED', 'Please wait before requesting another code. You can request up to five codes per hour.');
      }
      const data = { id, codeHash: this.otpHash(id, code), expiresAt: new Date(now.getTime() + 300000), requestedAt: now,
        windowStartedAt: sameWindow ? old.windowStartedAt : now,
        requestCount: sameWindow ? old.requestCount + 1 : 1, attempts: 0, consumed: false };
      await tx.otpChallenge.upsert({ where: { phone }, create: { phone, ...data }, update: data });
    });
    return { challengeId: id, expiresInSeconds: 300, resendAfterSeconds: 60, developmentCode: code, delivery: 'development' as const };
  }

  async verifyOtp(challengeId: string, code: string, requestId: string = randomUUID()) {
    if (this.env.OTP_MODE !== 'development') throw new ApiError(503, 'OTP_UNAVAILABLE', 'Sign-in is not available yet.');
    const token = randomBytes(32).toString('base64url');
    const result = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "OtpChallenge" WHERE "id" = ${challengeId}::uuid FOR UPDATE`;
      const challenge = await tx.otpChallenge.findUnique({ where: { id: challengeId } });
      if (!challenge || challenge.consumed || challenge.attempts >= 5 || challenge.expiresAt <= new Date()) return null;
      if (!timingSafeEqual(Buffer.from(challenge.codeHash, 'hex'), Buffer.from(this.otpHash(challengeId, code), 'hex'))) {
        // Return, don't throw: failed-attempt increments must commit.
        await tx.otpChallenge.update({ where: { id: challengeId }, data: { attempts: { increment: 1 } } });
        return null;
      }
      await tx.otpChallenge.update({ where: { id: challengeId }, data: { consumed: true, codeHash: '0'.repeat(64) } });
      const user = await tx.user.upsert({ where: { phone: challenge.phone },
        create: { phone: challenge.phone, roles: { create: { role: 'USER' } } }, update: {}, include: { roles: true } });
      if (user.accountStatus !== 'ACTIVE') return null;
      const privileged = user.roles.some(r => r.role === 'ADMIN' || r.role === 'DOCTOR');
      const expiresAt = new Date(Date.now() + (privileged ? 3600000 : 7 * 24 * 3600000));
      const session = await tx.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt } });
      if (user.roles.some(role => role.role === 'ADMIN')) {
        await tx.adminAuditEvent.create({ data: { actorId: user.id, action: 'ADMIN_LOGIN', resourceId: session.id, requestId, result: 'SUCCEEDED' } });
      }
      return { token, expiresAt: expiresAt.toISOString(), user: userDto(user) };
    });
    if (!result) throw invalidOtp();
    return result;
  }

  async verify(token: string): Promise<Principal | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { include: { roles: true } } } });
    if (!session || session.expiresAt <= new Date() || session.user.accountStatus !== 'ACTIVE') return null;
    return { userId: session.userId, sessionId: session.id, roles: session.user.roles.map(role => role.role) };
  }
  async getUser(principal: Principal) {
    const user = await this.prisma.user.findUnique({ where: { id: principal.userId }, include: { roles: true } });
    if (!user) throw unauthorized();
    return userDto(user);
  }
  async updateProfile(principal: Principal, input: ProfileInput) {
    const user = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${principal.userId}::uuid FOR UPDATE`;
      const previous = await tx.user.findUniqueOrThrow({ where: { id: principal.userId } });
      if (previous.notifications !== input.notifications) {
        await tx.consentRecord.create({ data: { userId: principal.userId, type: 'COMMUNICATION', version: '1', granted: input.notifications } });
        if (!input.notifications) await tx.notification.updateMany({ where: { userId: principal.userId, channel: { not: 'IN_APP' }, status: { in: ['PENDING', 'FAILED'] } }, data: { status: 'CANCELLED' } });
      }
      return tx.user.update({ where: { id: principal.userId },
        data: { ...input, profileCompletedAt: new Date() }, include: { roles: true } });
    });
    return userDto(user);
  }
  async logout(principal: Principal) {
    await this.prisma.adminElevation.deleteMany({ where: { sessionId: principal.sessionId } });
    await this.prisma.session.deleteMany({ where: { id: principal.sessionId, userId: principal.userId } });
  }
}
