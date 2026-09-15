import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { userDto, type ProfileInput } from './profile.js';
import type { Principal, SessionVerifier } from './contracts.js';
import { TwilioSmsProvider, type SmsOtpProvider } from './sms-provider.js';

const invalidOtp = () => new ApiError(400, 'INVALID_OTP', 'That code is incorrect or has expired. Please try again or request a new code.');
const unauthorized = () => new ApiError(401, 'UNAUTHENTICATED', 'Please sign in again.');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
type OtpPurpose = 'LOGIN' | 'DOCTOR_LOGIN' | 'DOCTOR_REGISTRATION' | 'ADMIN_LOGIN';
const registrationRequired = () => new ApiError(409, 'DOCTOR_REGISTRATION_REQUIRED', 'No doctor account exists yet. Choose Register as Doctor to apply.');
const testingDenied = () => new ApiError(403, 'TEST_LOGIN_NOT_ALLOWED', 'This account is not eligible for this staging test sign-in. Use the configured synthetic account for this app.');

// Delivery is configurable; all roles reuse this same OTP and session lifecycle.
export class IdentityService implements SessionVerifier {
  constructor(private readonly prisma: PrismaClient, private readonly env: Environment,
    private readonly sms: SmsOtpProvider = new TwilioSmsProvider(env)) {}

  private otpHash(id: string, code: string, purpose: OtpPurpose) {
    const scope = this.env.OTP_MODE === 'testing' ? `testing:${purpose}:` : '';
    return createHmac('sha256', this.env.SESSION_SECRET).update(`${scope}${id}:${code}`).digest('hex');
  }

  // Preview challenges and sessions cannot cross into real authentication mode.
  private sessionHash(token: string) {
    return hashToken(this.env.OTP_MODE === 'testing' ? `testing:${token}` : token);
  }

  private testingKind(phone: string | null) {
    if (!phone || !['staging', 'test'].includes(this.env.APP_ENV)) return undefined;
    try {
      const accounts = JSON.parse(this.env.OTP_TEST_ACCOUNTS) as Record<string, unknown>;
      const kind = accounts[createHash('sha256').update(phone).digest('hex')];
      return kind === 'PATIENT' || kind === 'DOCTOR' || kind === 'ADMIN' ? kind : undefined;
    } catch { return undefined; }
  }

  private isTestingUser(user: { id: string; phone: string | null; accountStatus: string; roles: { role: string }[] }) {
    const kind = this.testingKind(user.phone);
    if (kind === 'ADMIN') {
      // Preview replaces delivery only. Existing MFA must still protect every
      // administrative operation, with a key provisioned for this exact user.
      if (this.env.ADMIN_SECURITY_MODE !== 'totp') return false;
      try {
        if (!/^[A-Z2-7]{32,128}$/.test(JSON.parse(this.env.ADMIN_TOTP_KEYS)[user.id] ?? '')) return false;
      } catch { return false; }
    }
    return !!kind && user.accountStatus === 'ACTIVE' && user.roles.length === 1 &&
      user.roles[0]?.role === (kind === 'PATIENT' ? 'USER' : kind);
  }

  private async testingEligible(db: Pick<PrismaClient, 'doctor'>, phone: string,
    user: { id: string; phone: string | null; accountStatus: string; roles: { role: string }[] } | null, purpose: OtpPurpose) {
    const kind = this.testingKind(phone);
    if (kind !== (purpose === 'LOGIN' ? 'PATIENT' : purpose === 'ADMIN_LOGIN' ? 'ADMIN' : 'DOCTOR') || (user && !this.isTestingUser(user))) return false;
    // Public OTP endpoints can never create or promote an administrator.
    if (purpose === 'ADMIN_LOGIN') return !!user;
    if (purpose === 'LOGIN') return true;
    // An explicitly listed new Doctor identity still gets the existing
    // registration-required response; sign-in below never provisions a USER.
    if (!user) return true;
    const doctor = await db.doctor.findUnique({ where: { userId: user.id } });
    if (purpose === 'DOCTOR_REGISTRATION') return !doctor || !['SUSPENDED', 'INACTIVE'].includes(doctor.verificationStatus);
    return !!doctor && doctor.verificationStatus === 'VERIFIED' && !doctor.isDemo &&
      !!doctor.name.trim() && !!doctor.qualification.trim() && !!doctor.specialty.trim() &&
      !!doctor.biography.trim() && doctor.languages.length > 0;
  }

  async requestOtp(phone: string, purpose: OtpPurpose = 'LOGIN') {
    if (this.env.OTP_MODE === 'testing') {
      const existing = await this.prisma.user.findUnique({ where: { phone }, include: { roles: true } });
      if (!await this.testingEligible(this.prisma, phone, existing, purpose)) throw testingDenied();
    }
    if (purpose === 'ADMIN_LOGIN') {
      const existing = await this.prisma.user.findUnique({ where: { phone }, include: { roles: true } });
      if (!existing || existing.accountStatus !== 'ACTIVE' || !existing.roles.some(r => r.role === 'ADMIN')) {
        throw new ApiError(403, 'ADMIN_LOGIN_NOT_ALLOWED', 'An active administrator account is required.');
      }
    }
    if (purpose === 'DOCTOR_LOGIN') {
      const existing = await this.prisma.user.findUnique({ where: { phone }, include: { roles: true } });
      if (!existing) throw registrationRequired();
      if (existing.accountStatus !== 'ACTIVE' || !existing.roles.some(r => r.role === 'DOCTOR')) {
        throw new ApiError(403, 'DOCTOR_LOGIN_NOT_ALLOWED', 'This account cannot sign in to the Doctor app.');
      }
    }
    if (purpose === 'DOCTOR_REGISTRATION') {
      const existing = await this.prisma.user.findUnique({ where: { phone }, include: { roles: true } });
      if (existing && !existing.roles.some(r => r.role === 'DOCTOR')) {
        throw new ApiError(403, 'REGISTRATION_NOT_ALLOWED', 'This account cannot use doctor registration. Contact the platform team.');
      }
    }
    if (this.env.OTP_MODE === 'disabled' || (this.env.OTP_MODE === 'development' && !['development', 'test'].includes(this.env.APP_ENV))) {
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
      // Doctor/Admin sign-in is ordinary LOGIN with a stricter account lookup, not a
      // new authentication purpose or database lifecycle.
      const data = { id, purpose: purpose === 'DOCTOR_LOGIN' || purpose === 'ADMIN_LOGIN' ? 'LOGIN' : purpose, codeHash: this.otpHash(id, code, purpose), expiresAt: new Date(now.getTime() + 300000), requestedAt: now,
        windowStartedAt: sameWindow ? old.windowStartedAt : now,
        requestCount: sameWindow ? old.requestCount + 1 : 1, attempts: 0, consumed: this.env.OTP_MODE === 'provider' };
      await tx.otpChallenge.upsert({ where: { phone }, create: { phone, ...data }, update: data });
    });
    if (this.env.OTP_MODE === 'provider') {
      try { await this.sms.send(phone, code); }
      catch {
        await this.prisma.otpChallenge.updateMany({ where: { id }, data: { consumed: true, codeHash: '0'.repeat(64) } });
        throw new ApiError(503, 'OTP_UNAVAILABLE', 'We could not send a verification code. Please wait a moment and request a new code.');
      }
      await this.prisma.otpChallenge.updateMany({ where: { id }, data: { consumed: false } });
      return { challengeId: id, expiresInSeconds: 300, resendAfterSeconds: 60, delivery: 'provider' as const };
    }
    return { challengeId: id, expiresInSeconds: 300, resendAfterSeconds: 60, developmentCode: code,
      delivery: this.env.OTP_MODE === 'testing' ? 'testing' as const : 'development' as const };
  }

  async verifyOtp(challengeId: string, code: string, requestId: string = randomUUID(), purpose: OtpPurpose = 'LOGIN') {
    if (this.env.OTP_MODE === 'disabled') throw new ApiError(503, 'OTP_UNAVAILABLE', 'Sign-in is not available yet.');
    const token = randomBytes(32).toString('base64url');
    const result = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "OtpChallenge" WHERE "id" = ${challengeId}::uuid FOR UPDATE`;
      const challenge = await tx.otpChallenge.findUnique({ where: { id: challengeId } });
      const storedPurpose = purpose === 'DOCTOR_LOGIN' || purpose === 'ADMIN_LOGIN' ? 'LOGIN' : purpose;
      if (!challenge || challenge.purpose !== storedPurpose || challenge.consumed || challenge.attempts >= 5 || challenge.expiresAt <= new Date()) return null;
      if (this.env.OTP_MODE === 'testing') {
        const existing = await tx.user.findUnique({ where: { phone: challenge.phone }, include: { roles: true } });
        if (!await this.testingEligible(tx, challenge.phone, existing, purpose)) return null;
      }
      if (!timingSafeEqual(Buffer.from(challenge.codeHash, 'hex'), Buffer.from(this.otpHash(challengeId, code, purpose), 'hex'))) {
        // Return, don't throw: failed-attempt increments must commit.
        await tx.otpChallenge.update({ where: { id: challengeId }, data: { attempts: { increment: 1 } } });
        return null;
      }
      await tx.otpChallenge.update({ where: { id: challengeId }, data: { consumed: true, codeHash: '0'.repeat(64) } });
      // Doctor/Admin sign-in must never provision a Patient identity. Recheck the role
      // after OTP verification in case the account changed since the request.
      const user = purpose === 'DOCTOR_LOGIN' || purpose === 'ADMIN_LOGIN'
        ? await tx.user.findUnique({ where: { phone: challenge.phone }, include: { roles: true } })
        : await tx.user.upsert({ where: { phone: challenge.phone },
        create: { phone: challenge.phone, roles: { create: { role: purpose === 'DOCTOR_REGISTRATION' ? 'DOCTOR' : 'USER' } } }, update: {}, include: { roles: true } });
      if (!user || (purpose === 'DOCTOR_LOGIN' && !user.roles.some(r => r.role === 'DOCTOR'))) return null;
      if (purpose === 'ADMIN_LOGIN' && !user.roles.some(r => r.role === 'ADMIN')) return null;
      if (this.env.OTP_MODE === 'testing' && !this.isTestingUser(user)) return null;
      // Re-check inside the transaction: ordinary sign-in could have created USER
      // after a registration challenge was requested. Never promote that account.
      if (purpose === 'DOCTOR_REGISTRATION' && !user.roles.some(r => r.role === 'DOCTOR')) return null;
      if (purpose === 'DOCTOR_REGISTRATION' && user.accountStatus === 'ACTIVE') {
        await tx.doctor.upsert({ where: { userId: user.id }, update: {}, create: {
          userId: user.id, name: '', qualification: '', specialty: '', biography: '',
          registrationStartedAt: new Date(), verificationStatus: 'PENDING_VERIFICATION',
          acceptingAppointments: false, isDemo: false,
        } });
      }
      if (user.accountStatus !== 'ACTIVE') return null;
      const privileged = user.roles.some(r => r.role === 'ADMIN' || r.role === 'DOCTOR');
      const expiresAt = new Date(Date.now() + (privileged || this.env.OTP_MODE === 'testing' ? 3600000 : 7 * 24 * 3600000));
      const session = await tx.session.create({ data: { userId: user.id, tokenHash: this.sessionHash(token), expiresAt } });
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
    const session = await this.prisma.session.findUnique({ where: { tokenHash: this.sessionHash(token) }, include: { user: { include: { roles: true } } } });
    if (!session || session.expiresAt <= new Date() || session.user.accountStatus !== 'ACTIVE') return null;
    if (this.env.OTP_MODE === 'testing' && !this.isTestingUser(session.user)) return null;
    if (this.env.OTP_MODE === 'testing' && this.testingKind(session.user.phone) === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId: session.user.id } });
      if (!doctor || ['SUSPENDED', 'INACTIVE'].includes(doctor.verificationStatus)) return null;
    }
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
