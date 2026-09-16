import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { adminActor } from './security.js';
import { parse, pagination, programInput, moduleInput, lessonInput, liveInput } from './contracts.js';
import { dashboard, readiness, listOperations, operationDetail, programDto, orderSelect, appointmentSelect, subscriptionSelect } from './queries.js';
import { CommerceService } from '../wellness/commerce-service.js';
import { ConsultationService } from '../consultations/consultation-service.js';
import { RefundService } from '../payments/refunds.js';

export function registerAdminRoutes(app: FastifyInstance, env: Environment, db?: PrismaClient) {
  const database = (r: FastifyRequest) => { adminActor(r); if (!db) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Administration is unavailable.'); return db; };
  const params = (r: FastifyRequest) => parse(z.object({ id: z.string().uuid(), domain: z.string().optional(), childId: z.string().uuid().optional() }), r.params);
  app.get('/api/v1/admin/operations/dashboard', async r => ({ data: await dashboard(database(r), env) }));
  app.get('/api/v1/admin/operations/settings', async r => { database(r); return { data: { environment: env.APP_ENV, readiness: readiness(env), policies: JSON.parse(env.LEGAL_DOCUMENTS) as unknown } }; });
  app.get('/api/v1/admin/operations/:domain', async r => {
    const { domain } = parse(z.object({ domain: z.string() }), r.params); const q = parse(pagination.extend({pending:z.enum(['true','false']).optional()}), r.query);
    return { data: await listOperations(database(r), domain, q.page, q.q, domain === 'doctors' && q.pending === 'true') };
  });
  app.get('/api/v1/admin/operations/:domain/:id', async r => {
    const { id, domain } = params(r); return { data: await operationDetail(database(r), domain!, id) };
  });
  app.get('/api/v1/admin/operations/users/:id/activity', async r => {
    const db = database(r), { id } = params(r);
    const { kind, page } = parse(z.object({ kind: z.enum(['programs', 'orders', 'appointments', 'memberships']), page: z.coerce.number().int().min(1).max(1000).default(1) }).strict(), r.query);
    if (!await db.user.findUnique({ where: { id }, select: { id: true } })) throw new ApiError(404, 'NOT_FOUND', 'Account not found.');
    const range = { where: { userId: id }, take: 21, skip: (page - 1) * 20, orderBy: { id: 'asc' as const } };
    const items = kind === 'programs' ? await db.programEnrollment.findMany({ ...range, select: { id: true, status: true, enrolledAt: true, completedAt: true, program: { select: { title: true } } } }) :
      kind === 'orders' ? await db.order.findMany({ ...range, select: orderSelect }) : kind === 'appointments' ? await db.consultation.findMany({ ...range, select: appointmentSelect }) :
      await db.subscription.findMany({ ...range, select: { ...subscriptionSelect, plan: { select: { name: true } } } });
    return { data: { items: items.slice(0, 20), page, hasMore: items.length > 20 } };
  });
  app.post('/api/v1/admin/operations/users/:id/status', async r => {
    const db = database(r), { id } = params(r), actor = adminActor(r);
    const input = parse(z.object({ status: z.enum(['ACTIVE', 'DEACTIVATED', 'SUSPENDED']), reason: z.enum(['SUPPORT_REQUEST', 'SECURITY_REVIEW', 'POLICY_REVIEW']) }).strict(), r.body);
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id }, include: { roles: true } });
      if (!user) throw new ApiError(404, 'NOT_FOUND', 'Account not found.');
      if (id === actor.userId || user.roles.some(role => role.role === 'ADMIN')) throw new ApiError(403, 'FORBIDDEN', 'Privileged accounts require the separate operator recovery process.');
      if (input.status === 'ACTIVE' && user.accountStatus === 'DELETION_REQUESTED') throw new ApiError(409, 'PRIVACY_REVIEW_REQUIRED', 'Review the pending privacy request before reactivation.');
      await tx.user.update({ where: { id }, data: { accountStatus: input.status } });
      await tx.session.deleteMany({ where: { userId: id } }); await tx.adminElevation.deleteMany({ where: { userId: id } });
      await tx.adminAuditEvent.create({ data: { actorId: actor.userId, action: `ACCOUNT_${input.status}_${input.reason}`, resourceId: id, requestId: r.id, result: 'SUCCEEDED' } });
    }); return { data: { saved: true } };
  });
  app.patch('/api/v1/admin/operations/doctors/:id', async r => {
    database(r); params(r);
    throw new ApiError(403, 'DOCTOR_DETAILS_READ_ONLY', 'Doctor details are read-only for administrators. Use application review to request corrections.');
  });
  app.post('/api/v1/admin/operations/doctors/:id/availability', async r => {
    database(r); params(r);
    throw new ApiError(403, 'DOCTOR_DETAILS_READ_ONLY', 'Doctor availability is read-only for administrators. The doctor manages their schedule.');
  });
  app.post('/api/v1/admin/operations/categories', async r => {
    const db = database(r), input = parse(z.object({ id: z.string().regex(/^[a-z0-9-]{1,60}$/), name: z.string().trim().min(1).max(100), interest: z.string().max(100).nullable(), position: z.number().int().min(0).max(1000) }).strict(), r.body);
    return { data: { item: await db.programCategory.upsert({ where: { id: input.id }, create: input, update: input }) } };
  });
  async function saveProgram(r: FastifyRequest, creating: boolean) {
    const db = database(r), id = creating ? undefined : params(r).id;
    const input = creating ? parse(programInput.extend({ isDemo: z.boolean() }), r.body) : parse(programInput, r.body);
    const { publicationStatus, ...fields } = input;
    const item = await db.$transaction(async tx => {
      if (id) await tx.$queryRaw`SELECT "id" FROM "Program" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const old = id ? await tx.program.findUnique({ where: { id } }) : null;
      if (id && !old) throw new ApiError(404, 'NOT_FOUND', 'Program not found.');
      const doctor = await tx.doctor.findUnique({ where: { id: fields.doctorId } });
      if (!doctor || !await tx.programCategory.findUnique({ where: { id: fields.categoryId } })) throw new ApiError(400, 'INVALID_REQUEST', 'Choose an existing doctor and category.');
      const isDemo = 'isDemo' in fields ? fields.isDemo as boolean : old!.isDemo;
      if (isDemo && env.DEMO_PROGRAMS !== 'true') throw new ApiError(403, 'DEMO_DISABLED', 'Demo publishing is disabled.');
      if (publicationStatus === 'PUBLISHED' && !(isDemo && doctor.isDemo) && (doctor.isDemo || !doctor.verifiedAt || doctor.verificationStatus !== 'VERIFIED')) throw new ApiError(409, 'VERIFICATION_REQUIRED', 'Publication requires a verified professional.');
      if (creating && publicationStatus !== 'DRAFT') throw new ApiError(400, 'INVALID_REQUEST', 'Create the program as a draft, then review its content.');
      const data = { ...fields, published: publicationStatus === 'PUBLISHED', archivedAt: publicationStatus === 'ARCHIVED' ? new Date() : null };
      return id ? tx.program.update({ where: { id }, data }) : tx.program.create({ data: { ...data, isDemo } });
    }); return { data: { item: programDto(item) } };
  }
  app.post('/api/v1/admin/operations/programs', r => saveProgram(r, true));
  app.patch('/api/v1/admin/operations/programs/:id', r => saveProgram(r, false));
  // Enrolled content requires a new version; never rewrite progress underneath users.
  for (const kind of ['modules', 'lessons', 'live-sessions'] as const) {
    const base = kind === 'lessons' ? '/api/v1/admin/operations/modules/:id/lessons' : `/api/v1/admin/operations/programs/:id/${kind}`;
    for (const editing of [false, true]) app.route({ method: editing ? 'PATCH' : 'POST', url: editing ? `${base}/:childId` : base, handler: async r => {
      const db = database(r), { id, childId } = params(r);
      const item = await db.$transaction(async tx => {
        const module = kind === 'lessons' ? await tx.programModule.findUnique({ where: { id } }) : null;
        const programId = kind === 'lessons' ? module?.programId : id;
        if (!programId) throw new ApiError(404, 'NOT_FOUND', 'Program not found.');
        await tx.$queryRaw`SELECT "id" FROM "Program" WHERE "id" = ${programId}::uuid FOR UPDATE`;
        const program = await tx.program.findUnique({ where: { id: programId } });
        if (!program || program.published || program.archivedAt || await tx.programEnrollment.count({ where: { programId } })) throw new ApiError(409, 'CURRICULUM_LOCKED', 'Edit a draft with no enrollments. Create a new program version for enrolled content.');
        if (kind === 'modules') { const data = parse(moduleInput, r.body); return editing ? tx.programModule.update({ where: { id: childId!, programId }, data }) : tx.programModule.create({ data: { ...data, programId } }); }
        if (kind === 'lessons') { const data = parse(lessonInput, r.body); return editing ? tx.lesson.update({ where: { id: childId!, moduleId: id }, data }) : tx.lesson.create({ data: { ...data, moduleId: id } }); }
        const data = parse(liveInput, r.body); return editing ? tx.liveSession.update({ where: { id: childId!, programId }, data }) : tx.liveSession.create({ data: { ...data, programId } });
      }); return { data: { item } };
    } });
  }
  for (const domain of ['orders', 'appointments']) app.post(`/api/v1/admin/operations/${domain}/:id/cancel`, async r => {
    const db = database(r), { id } = params(r); parse(z.object({}).strict(), r.body ?? {});
    const record = domain === 'orders' ? await db.order.findUnique({ where: { id }, select: { userId: true } }) : await db.consultation.findUnique({ where: { id }, select: { userId: true } });
    if (!record) throw new ApiError(404, 'NOT_FOUND', 'Record not found.');
    if (domain === 'orders') await new CommerceService(db, env).cancel(record.userId, id);
    else await new ConsultationService(db, env).cancel(record.userId, id);
    return { data: { saved: true } };
  });
  app.post('/api/v1/admin/operations/payments/:id/refund', async r => {
    const db = database(r), { id } = params(r); parse(z.object({ confirm: z.literal(true) }).strict(), r.body);
    const result = await db.enrollmentPayment.updateMany({ where: { id, status: 'VERIFIED', refundStatus: 'NOT_REQUESTED' }, data: { refundStatus: 'REFUND_REQUESTED' } });
    if (!result.count && !await db.enrollmentPayment.findFirst({ where: { id, status: 'VERIFIED', refundStatus: 'REFUND_REQUESTED' } })) throw new ApiError(409, 'INVALID_STATE', 'This payment cannot be submitted for refund review.');
    return { data: { saved: true, message: 'Refund requested. Money has not been returned.' } };
  });
  app.post('/api/v1/admin/operations/notifications/:id/retry', async r => {
    const db = database(r), { id } = params(r); parse(z.object({ confirm: z.literal(true) }).strict(), r.body);
    const result = await db.notification.updateMany({ where: { id, status: { in: ['FAILED', 'DEAD_LETTER'] }, providerReference: null }, data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lastError: null } });
    if (!result.count) throw new ApiError(409, 'INVALID_STATE', 'This notification cannot be retried.'); return { data: { saved: true } };
  });
  for (const action of ['process', 'reconcile'] as const) app.post(`/api/v1/admin/refunds/:id/${action}`, async r => {
    const db = database(r), { id } = params(r); parse(z.object({ confirm: z.literal(true) }).strict(), r.body);
    const service = new RefundService(db, env);
    return { data: action === 'process' ? await service.process(id, r.id) : await service.reconcile(id) };
  });
}
