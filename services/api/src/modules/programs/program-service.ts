import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { DevelopmentPaymentProvider, receiptMatches } from './payment-provider.js';
import { entitled, requireEntitlement } from '../membership/entitlements.js';
import { ProgramAnalytics } from './analytics.js';

const include = { doctor: true, category: true, modules: { orderBy: { position: 'asc' as const },
  include: { lessons: { orderBy: { position: 'asc' as const } } } }, liveSessions: { orderBy: { startsAt: 'asc' as const } } } satisfies Prisma.ProgramInclude;
type FullProgram = Prisma.ProgramGetPayload<{ include: typeof include }>;
export type DiscoveryQuery = { q?: string | undefined; category?: string | undefined; type?: 'RECORDED' | 'LIVE' | undefined;
  price?: 'free' | 'paid' | undefined; duration?: 'short' | 'long' | undefined; featured?: boolean | undefined;
  recommended?: boolean | undefined; page?: number | undefined };
const missing = () => new ApiError(404, 'PROGRAM_NOT_FOUND', 'This program is not available.');
const noAccess = () => new ApiError(403, 'ENROLLMENT_REQUIRED', 'Join this program to access its lessons.');

export function visibleProgramWhere(env: Environment): Prisma.ProgramWhereInput {
  return { published: true, OR: [{ isDemo: false, doctor: { isDemo: false, verifiedAt: { not: null }, verificationStatus: 'VERIFIED' } },
    ...(env.DEMO_PROGRAMS === 'true' ? [{ isDemo: true, doctor: { isDemo: true } }] : [])] };
}

export class ProgramService {
  readonly analytics = new ProgramAnalytics();
  constructor(private readonly db: PrismaClient, private readonly env: Environment) {}
  private visible(): Prisma.ProgramWhereInput {
    return visibleProgramWhere(this.env);
  }
  private async program(id: string) {
    const program = await this.db.program.findFirst({ where: { ...this.visible(), id }, include });
    if (!program) throw missing();
    return program;
  }
  private card(program: FullProgram) {
    return { id: program.id, title: program.title, description: program.description, audience: program.audience,
      outcomes: program.outcomes, coverUrl: program.coverUrl, type: program.type, level: program.level,
      durationMinutes: program.durationMinutes, pricePaise: program.pricePaise, currency: program.currency,
      membershipOnly: program.membershipOnly, featured: program.featured, isDemo: program.isDemo, category: program.category,
      doctor: { name: program.doctor.name, qualification: program.doctor.qualification, specialty: program.doctor.specialty,
        experienceYears: program.doctor.experienceYears, biography: program.doctor.biography,
        verified: program.doctor.verifiedAt !== null && !program.doctor.isDemo, isDemo: program.doctor.isDemo },
      lessonCount: program.modules.reduce((sum, module) => sum + module.lessons.length, 0),
      sessionCount: program.liveSessions.length };
  }
  async categories() { return this.db.programCategory.findMany({ orderBy: { position: 'asc' } }); }
  async discover(userId: string, query: DiscoveryQuery) {
    const filters: Prisma.ProgramWhereInput[] = [this.visible()];
    if (query.q) {
      const match = { contains: query.q, mode: 'insensitive' as const };
      filters.push({ OR: [{ title: match }, { description: match }, { doctor: { name: match } }, { category: { name: match } }] });
      this.analytics.record('search_performed');
    }
    if (query.category) filters.push({ categoryId: query.category });
    if (query.type) filters.push({ type: query.type });
    if (query.price) filters.push({ pricePaise: query.price === 'free' ? 0 : { gt: 0 } });
    if (query.duration) filters.push({ durationMinutes: query.duration === 'short' ? { lte: 60 } : { gt: 60 } });
    if (query.featured) filters.push({ featured: true });
    if (query.recommended) {
      const user = await this.db.user.findUnique({ where: { id: userId }, select: { interests: true } });
      filters.push({ category: { interest: { in: user?.interests ?? [] } }, enrollments: { none: { userId } } });
    }
    const page = query.page ?? 1;
    const where = { AND: filters };
    const [programs, total] = await Promise.all([this.db.program.findMany({ where, include, take: 20,
      skip: (page - 1) * 20, orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }] }), this.db.program.count({ where })]);
    const enrolled = await this.db.programEnrollment.findMany({ where: { userId, programId: { in: programs.map(p => p.id) } }, select: { programId: true } });
    return { programs: programs.map(p => ({ ...this.card(p), enrolled: enrolled.some(e => e.programId === p.id) })), total, page };
  }
  async detail(userId: string, id: string) {
    const program = await this.program(id);
    const enrollment = await this.db.programEnrollment.findUnique({ where: { userId_programId: { userId, programId: id } } });
    this.analytics.record('program_viewed');
    const memberAccess = await entitled(this.db, this.env, userId, 'PROGRAM_ACCESS', id);
    const membershipRequired = program.membershipOnly && !await entitled(this.db, this.env, userId, 'MEMBER_PROGRAMS', id);
    const hasPaidAccess = program.pricePaise === 0 || memberAccess || !!await this.db.enrollmentPayment.findFirst({ where: { userId, programId: id, status: 'VERIFIED', refundStatus: { not: 'REFUNDED' }, provider: program.isDemo ? 'development' : 'razorpay' } });
    return { ...this.card(program), memberAccess, membershipRequired, enrolled: enrollment !== null && hasPaidAccess && !membershipRequired,
      paymentMode: program.isDemo && this.env.PAYMENT_MODE === 'development' ? 'development' : 'disabled',
      modules: program.modules.map(module => ({ id: module.id, title: module.title, position: module.position,
        lessons: module.lessons.map(lesson => ({ id: lesson.id, title: lesson.title, durationSeconds: lesson.durationSeconds, required: lesson.required })) })),
      liveSessions: program.liveSessions.map(session => ({ id: session.id, title: session.title, startsAt: session.startsAt,
        durationMinutes: session.durationMinutes, status: this.liveStatus(session),
        information: enrollment && !membershipRequired && hasPaidAccess ? session.information : null, joinAvailable: false })) };
  }
  private liveStatus(session: { startsAt: Date; durationMinutes: number }) {
    const now = Date.now();
    return now < session.startsAt.getTime() ? 'UPCOMING' : now < session.startsAt.getTime() + session.durationMinutes * 60000 ? 'LIVE' : 'COMPLETED';
  }
  async enroll(userId: string, id: string) {
    const program = await this.program(id);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId + id}))::text`;
      const existing = await tx.programEnrollment.findUnique({ where: { userId_programId: { userId, programId: id } } });
      if (existing) return existing;
      if (program.membershipOnly) await requireEntitlement(tx, this.env, userId, 'MEMBER_PROGRAMS', id);
      if (program.pricePaise > 0 && !await entitled(tx, this.env, userId, 'PROGRAM_ACCESS', id)) throw new ApiError(402, 'PAYMENT_REQUIRED', 'Complete payment before joining this program.');
      const created = await tx.programEnrollment.create({ data: { userId, programId: id } });
      this.analytics.record('program_enrolled');
      return created;
    });
  }
  async payment(userId: string, id: string) {
    const program = await this.program(id);
    if (program.membershipOnly) await requireEntitlement(this.db, this.env, userId, 'MEMBER_PROGRAMS', id);
    if (!program.isDemo || this.env.PAYMENT_MODE !== 'development') throw new ApiError(503, 'PAYMENT_UNAVAILABLE', 'Payments are not available yet.');
    if (program.pricePaise <= 0) throw new ApiError(400, 'INVALID_REQUEST', 'This program is free.');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId + id}))::text`;
      if (await tx.enrollmentPayment.findFirst({ where: { userId, programId: id, status: 'VERIFIED', refundStatus: { not: 'REFUNDED' }, provider: program.isDemo ? 'development' : 'razorpay' } }) || await entitled(tx, this.env, userId, 'PROGRAM_ACCESS', id)) {
        throw new ApiError(409, 'ALREADY_ENROLLED', 'You have already joined this program.');
      }
      const old = await tx.enrollmentPayment.findFirst({ where: { userId, programId: id, status: 'PENDING' } });
      return old ?? tx.enrollmentPayment.create({ data: { userId, programId: id, amountPaise: program.pricePaise, currency: program.currency, provider: 'development' } });
    });
  }
  async settleDevelopment(userId: string, paymentId: string, outcome: 'capture' | 'fail') {
    if (this.env.PAYMENT_MODE !== 'development' || this.env.DEMO_PROGRAMS !== 'true') throw new ApiError(503, 'PAYMENT_UNAVAILABLE', 'Payments are not available yet.');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "EnrollmentPayment" WHERE "id" = ${paymentId}::uuid FOR UPDATE`;
      const payment = await tx.enrollmentPayment.findFirst({ where: { id: paymentId, userId }, include: { program: true } });
      if (!payment || !payment.programId || !payment.program?.isDemo || payment.provider !== 'development') throw missing();
      if (payment.status === 'VERIFIED') return { verified: true, programId: payment.programId, mode: 'development' };
      if (payment.status === 'FAILED') return { verified: false, programId: payment.programId, mode: 'development' };
      const currentProgram = await this.program(payment.programId);
      if (currentProgram.membershipOnly) await requireEntitlement(tx, this.env, userId, 'MEMBER_PROGRAMS', payment.programId);
      // Provider simulation receives the persisted order; client cannot supply price,
      // paid status, currency, provider reference or another user's entitlement.
      const receipt = await new DevelopmentPaymentProvider(this.env, payment, outcome).verify(payment.id);
      const verified = receiptMatches(payment, receipt);
      await tx.enrollmentPayment.update({ where: { id: payment.id }, data: { status: verified ? 'VERIFIED' : 'FAILED',
        providerReference: receipt.reference, verifiedAt: verified ? new Date() : null } });
      if (verified) {
        await tx.programEnrollment.upsert({ where: { userId_programId: { userId, programId: payment.programId } },
          create: { userId, programId: payment.programId }, update: {} });
        this.analytics.record('program_enrolled');
      }
      return { verified, programId: payment.programId, mode: 'development' };
    });
  }
  private async access(userId: string, id: string) {
    const program = await this.program(id);
    const enrollment = await this.db.programEnrollment.findUnique({ where: { userId_programId: { userId, programId: id } }, include: { progress: true } });
    if (!enrollment) throw noAccess();
    if (program.membershipOnly) await requireEntitlement(this.db, this.env, userId, 'MEMBER_PROGRAMS', id);
    if (program.pricePaise > 0 && !await entitled(this.db, this.env, userId, 'PROGRAM_ACCESS', id) && !await this.db.enrollmentPayment.findFirst({ where: { userId, programId: id, status: 'VERIFIED', refundStatus: { not: 'REFUNDED' },
      ...(program.isDemo ? { provider: 'development' } : { provider: 'razorpay' }) } })) throw noAccess();
    return { program, enrollment };
  }
  async overview(userId: string, id: string) {
    const { program, enrollment } = await this.access(userId, id);
    const lessons = program.modules.flatMap(module => module.lessons);
    const required = lessons.filter(l => l.required);
    const completed = required.filter(l => enrollment.progress.some(p => p.lessonId === l.id && p.completedAt)).length;
    const last = [...enrollment.progress].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    const next = last && !last.completedAt ? last.lessonId : lessons.find(l => !enrollment.progress.some(p => p.lessonId === l.id && p.completedAt))?.id ?? lessons[0]?.id ?? null;
    return { program: await this.detail(userId, id), enrollment: { id: enrollment.id, status: enrollment.status,
      enrolledAt: enrollment.enrolledAt, completedAt: enrollment.completedAt, completedLessons: completed, totalLessons: required.length,
      percentage: required.length ? Math.round(completed / required.length * 100) : 0, currentLessonId: next },
      progress: enrollment.progress.map(p => ({ lessonId: p.lessonId, positionSeconds: p.positionSeconds, completedAt: p.completedAt })) };
  }
  async mine(userId: string) {
    const enrolled = await this.db.programEnrollment.findMany({ where: { userId, program: this.visible() }, orderBy: { enrolledAt: 'desc' }, take: 100 });
    const result = [];
    for (const enrollment of enrolled) {
      try { result.push(await this.overview(userId, enrollment.programId)); }
      catch (error) { if (!(error instanceof ApiError && error.statusCode === 403)) throw error; }
    }
    return result;
  }
  async lesson(userId: string, id: string, lessonId: string) {
    const { program, enrollment } = await this.access(userId, id);
    const lessons = program.modules.flatMap(module => module.lessons);
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) throw missing();
    let mediaUrl: string | null = null;
    if (lesson.mediaRef) {
      if (program.isDemo && this.env.DEMO_PROGRAMS === 'true' && lesson.mediaRef === 'demo:bee') {
        mediaUrl = 'https://flutter.github.io/assets-for-api-docs/assets/videos/bee.mp4';
      } else throw new ApiError(503, 'MEDIA_UNAVAILABLE', 'This video is not available right now. Please try again later.');
    }
    return { id: lesson.id, title: lesson.title, description: lesson.description, durationSeconds: lesson.durationSeconds,
      keyPoints: lesson.keyPoints, supportingMaterial: lesson.supportingMaterial, mediaUrl, isDemo: program.isDemo,
      positionSeconds: enrollment.progress.find(p => p.lessonId === lessonId)?.positionSeconds ?? 0,
      completed: enrollment.progress.some(p => p.lessonId === lessonId && p.completedAt),
      nextLessonId: lessons[lessons.findIndex(l => l.id === lessonId) + 1]?.id ?? null };
  }
  async progress(userId: string, id: string, lessonId: string, input: { positionSeconds: number; completed: boolean }) {
    const { program, enrollment } = await this.access(userId, id);
    const lessons = program.modules.flatMap(module => module.lessons);
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson || program.type !== 'RECORDED') throw missing();
    if (input.positionSeconds > lesson.durationSeconds) throw new ApiError(400, 'INVALID_PROGRESS', 'Please check the lesson position.');
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ProgramEnrollment" WHERE "id" = ${enrollment.id}::uuid FOR UPDATE`;
      const previous = await tx.lessonProgress.findUnique({ where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } } });
      await tx.lessonProgress.upsert({ where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
        create: { enrollmentId: enrollment.id, lessonId, positionSeconds: input.positionSeconds, completedAt: input.completed ? new Date() : null },
        update: { positionSeconds: input.positionSeconds, completedAt: previous?.completedAt ?? (input.completed ? new Date() : null) } });
      const required = lessons.filter(l => l.required).map(l => l.id);
      const count = await tx.lessonProgress.count({ where: { enrollmentId: enrollment.id, lessonId: { in: required }, completedAt: { not: null } } });
      const complete = required.length > 0 && count === required.length;
      const fresh = await tx.programEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
      await tx.programEnrollment.update({ where: { id: enrollment.id }, data: { status: complete ? 'COMPLETED' : 'IN_PROGRESS',
        completedAt: complete ? fresh.completedAt ?? new Date() : null } });
      if (!previous) this.analytics.record('lesson_started');
      if (input.completed && !previous?.completedAt) this.analytics.record('lesson_completed');
      if (complete && fresh.status !== 'COMPLETED') this.analytics.record('program_completed');
    });
    return this.overview(userId, id);
  }
}

