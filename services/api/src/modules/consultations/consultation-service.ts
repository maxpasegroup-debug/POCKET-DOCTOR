import type { Doctor, Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { memberPrice } from '../membership/entitlements.js';
import { ApiError } from '../../errors/api-error.js';
import { DevelopmentPaymentProvider, receiptMatches } from '../programs/payment-provider.js';
import { generateSlots, type AvailabilityInput } from './availability.js';
import { UnavailableConsultationProvider, type ConsultationSessionProvider } from './session-provider.js';

type Tx = Prisma.TransactionClient;
const missing = () => new ApiError(404, 'NOT_FOUND', 'This consultation or doctor is not available.');
const unavailable = () => new ApiError(409, 'SLOT_UNAVAILABLE', 'This time is no longer available. Please choose another slot.');
const active = ['PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'] as const;
const appointmentInclude = { doctor: true, note: true, payments: true, user: { select: { fullName: true } } } satisfies Prisma.ConsultationInclude;
type Appointment = Prisma.ConsultationGetPayload<{ include: typeof appointmentInclude }>;

export function doctorDto(doctor: Doctor) {
  return { id: doctor.id, name: doctor.name, qualification: doctor.qualification, specialty: doctor.specialty,
    experienceYears: doctor.experienceYears, biography: doctor.biography, photoUrl: doctor.photoUrl,
    languages: doctor.languages, feePaise: doctor.feePaise, currency: 'INR', consultationMinutes: doctor.consultationMinutes,
    timezone: doctor.timezone, isDemo: doctor.isDemo, verified: !doctor.isDemo && doctor.verificationStatus === 'VERIFIED',
    featured: doctor.featured, mode: 'PROVIDER_READY', providerAvailable: false };
}

export class ConsultationService {
  // Aggregate counters only: no actor IDs, specialty, query text or record content.
  readonly events = new Map<string, number>();
  constructor(private db: PrismaClient, private env: Environment,
    private sessions: ConsultationSessionProvider = new UnavailableConsultationProvider()) {}
  async sessionAccess(userId: string, id: string, role: 'patient' | 'doctor') {
    const doctor = role === 'doctor' ? await this.assignedDoctor(userId) : null;
    const appointment = await this.db.consultation.findFirst({ where: { id, ...(doctor ? { doctorId: doctor.id } : { userId }) }, include: { payments: true } });
    if (!appointment) throw missing();
    const now = new Date();
    if (!['CONFIRMED', 'IN_PROGRESS'].includes(appointment.status) || now < appointment.startsAt || now >= appointment.endsAt
      || (appointment.feePaise > 0 && !appointment.payments.some(payment => payment.status === 'VERIFIED' && payment.refundStatus !== 'REFUNDED')))
      throw new ApiError(409, 'SESSION_UNAVAILABLE', 'This appointment is not available to join now.');
    return this.sessions.createAccess({ consultationId: appointment.id, participantId: userId, role,
      expiresAt: new Date(Math.min(appointment.endsAt.getTime(), Date.now() + 300000)) });
  }
  private event(name: 'doctor_profile_viewed' | 'doctor_search' | 'slot_viewed' | 'booking_started' | 'booking_completed' | 'booking_cancelled') {
    this.events.set(name, (this.events.get(name) ?? 0) + 1);
  }
  private visible(): Prisma.DoctorWhereInput {
    return { verificationStatus: 'VERIFIED', acceptingAppointments: true,
      ...(this.env.DEMO_CONSULTATIONS === 'true' ? {} : { isDemo: false }) };
  }
  private async doctor(id: string, tx: Tx = this.db) {
    const doctor = await tx.doctor.findFirst({ where: { id, ...this.visible() }, include: { availability: true, exceptions: true } });
    if (!doctor) throw missing();
    return doctor;
  }
  async discover(query: { q?: string | undefined; specialty?: string | undefined; featured?: boolean | undefined; page?: number | undefined }) {
    const where: Prisma.DoctorWhereInput = { ...this.visible(), ...(query.specialty ? { specialty: query.specialty } : {}),
      ...(query.featured ? { featured: true } : {}), ...(query.q ? { OR: [
        { name: { contains: query.q, mode: 'insensitive' } }, { specialty: { contains: query.q, mode: 'insensitive' } },
        { languages: { has: query.q.toLowerCase() } },
      ] } : {}) };
    const page = query.page ?? 1;
    const [doctors, total] = await Promise.all([this.db.doctor.findMany({ where, orderBy: [{ featured: 'desc' }, { name: 'asc' }, { id: 'asc' }], take: 20, skip: (page - 1) * 20 }), this.db.doctor.count({ where })]);
    this.event('doctor_search');
    return { doctors: doctors.map(doctorDto), total, page };
  }
  async specialties() {
    const rows = await this.db.doctor.findMany({ where: this.visible(), select: { specialty: true }, distinct: ['specialty'], orderBy: { specialty: 'asc' } });
    return rows.map(row => row.specialty);
  }
  async detail(id: string) { this.event('doctor_profile_viewed'); return doctorDto(await this.doctor(id)); }
  private async lock(tx: Tx, doctorId: string) {
    await tx.$queryRaw`SELECT "id" FROM "Doctor" WHERE "id" = ${doctorId}::uuid FOR UPDATE`;
    await tx.consultation.updateMany({ where: { doctorId, status: 'PENDING_PAYMENT', holdExpiresAt: { lte: new Date() } }, data: { status: 'EXPIRED' } });
  }
  private async lockAssigned(tx: Tx, doctorId: string, userId: string) {
    await this.lock(tx, doctorId);
    const doctor = await tx.doctor.findFirst({ where: { id: doctorId, userId, verificationStatus: 'VERIFIED' } });
    if (!doctor || (doctor.isDemo && this.env.DEMO_CONSULTATIONS !== 'true')) throw new ApiError(403, 'FORBIDDEN', 'A verified doctor account is required.');
  }
  private async available(id: string, date: string, tx: Tx = this.db, excludeId?: string) {
    const day = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(day) || day < Date.now() - 86400000 || day > Date.now() + 31 * 86400000) throw new ApiError(400, 'INVALID_DATE', 'Choose a date within the next 30 days.');
    const doctor = await this.doctor(id, tx);
    const slots = generateSlots(date, { timezone: doctor.timezone, consultationMinutes: doctor.consultationMinutes,
      bufferMinutes: doctor.bufferMinutes, windows: doctor.availability, excludedDates: doctor.exceptions.map(e => e.localDate) });
    const booked = await tx.consultation.findMany({ where: { doctorId: id, ...(excludeId ? { id: { not: excludeId } } : {}),
      status: { in: [...active] }, OR: [{ status: { not: 'PENDING_PAYMENT' } }, { holdExpiresAt: { gt: new Date() } }],
      startsAt: { lt: new Date(day + 39 * 3600000) }, reservedUntil: { gt: new Date(day - 14 * 3600000) } },
      select: { startsAt: true, reservedUntil: true } });
    return { doctor, slots: slots.filter(slot => !booked.some(b => b.startsAt < slot.reservedUntil && b.reservedUntil > slot.startsAt)) };
  }
  async slots(id: string, date: string) {
    const { doctor, slots } = await this.available(id, date);
    this.event('slot_viewed');
    return { timezone: doctor.timezone, slots: slots.map(s => ({ startsAt: s.startsAt, endsAt: s.endsAt })) };
  }
  async book(userId: string, doctorId: string, date: string, startsAt: string) {
    const result = await this.db.$transaction(async tx => {
      await this.lock(tx, doctorId);
      const { doctor, slots } = await this.available(doctorId, date, tx);
      if (doctor.userId === userId) throw new ApiError(400, 'INVALID_REQUEST', 'Choose another doctor.');
      const slot = slots.find(s => s.startsAt.toISOString() === new Date(startsAt).toISOString());
      if (!slot) throw unavailable();
      const feePaise = await memberPrice(tx, this.env, userId, 'CONSULTATION_DISCOUNT', doctor.feePaise, doctorId);
      if (feePaise > 0 && (!doctor.isDemo || this.env.PAYMENT_MODE !== 'development')) throw new ApiError(503, 'PAYMENT_UNAVAILABLE', 'Paid consultations are not available yet.');
      const appointment = await tx.consultation.create({ data: { userId, doctorId, ...slot, timezone: doctor.timezone,
        feePaise, holdExpiresAt: new Date(Date.now() + this.env.BOOKING_HOLD_MINUTES * 60000),
        status: feePaise === 0 ? 'CONFIRMED' : 'PENDING_PAYMENT' } });
      if (appointment.status === 'CONFIRMED') await this.reminders(tx, appointment.id, appointment.startsAt);
      return appointment.id;
    });
    this.event('booking_started');
    const appointment = await this.detailFor(userId, result);
    if (appointment.status === 'CONFIRMED') this.event('booking_completed');
    return appointment;
  }
  private async owned(userId: string, id: string, tx: Tx = this.db) {
    const appointment = await tx.consultation.findFirst({ where: { id, userId }, include: appointmentInclude });
    if (!appointment) throw missing();
    return appointment;
  }
  private dto(a: Appointment, doctorView = false) {
    const status = a.status === 'PENDING_PAYMENT' && a.holdExpiresAt <= new Date() ? 'EXPIRED' : a.status;
    return { id: a.id, doctor: doctorDto(a.doctor), startsAt: a.startsAt, endsAt: a.endsAt, timezone: a.timezone,
      status, mode: a.mode, feePaise: a.feePaise, currency: a.currency, holdExpiresAt: a.holdExpiresAt,
      completedAt: a.completedAt, refundStatus: a.refundStatus, providerAvailable: false,
      cancellationWindowMinutes: this.env.CANCELLATION_WINDOW_MINUTES,
      paymentStatus: a.payments.some(p => p.status === 'VERIFIED') ? 'VERIFIED' : a.feePaise === 0 ? 'NOT_REQUIRED' : a.payments.length === 0 || a.payments.some(p => p.status === 'PENDING') ? 'PENDING' : 'FAILED',
      ...(doctorView ? { patientName: a.user.fullName ?? 'Pocket Doctor user' } : {}),
      note: a.note && (doctorView || a.status === 'COMPLETED') ? { summary: a.note.summary,
        followUpRequired: a.note.followUpRequired, followUpDate: a.note.followUpDate, followUpNote: a.note.followUpNote,
        ...(doctorView ? { privateNote: a.note.privateNote } : {}) } : null };
  }
  async detailFor(userId: string, id: string) { return this.dto(await this.owned(userId, id)); }
  async mine(userId: string) {
    return (await this.db.consultation.findMany({ where: { userId }, include: appointmentInclude, orderBy: { startsAt: 'desc' }, take: 100 })).map(a => this.dto(a));
  }
  private async reminders(tx: Tx, id: string, startsAt: Date) {
    await tx.consultationReminder.deleteMany({ where: { consultationId: id } });
    await tx.consultationReminder.createMany({ data: [1440, 60, 0].map(minutesBefore => ({ consultationId: id, minutesBefore,
      dueAt: new Date(startsAt.getTime() - minutesBefore * 60000) })).filter(r => r.dueAt > new Date()) });
  }
  async payment(userId: string, id: string) {
    const owned = await this.owned(userId, id);
    return this.db.$transaction(async tx => {
      await this.lock(tx, owned.doctorId);
      const a = await this.owned(userId, id, tx);
      await this.doctor(a.doctorId, tx);
      if (a.status !== 'PENDING_PAYMENT') throw new ApiError(409, 'BOOKING_NOT_PENDING', 'This booking is no longer awaiting payment.');
      if (!a.doctor.isDemo || this.env.PAYMENT_MODE !== 'development' || this.env.DEMO_CONSULTATIONS !== 'true') throw new ApiError(503, 'PAYMENT_UNAVAILABLE', 'Payments are not available yet.');
      const payment = await tx.enrollmentPayment.findFirst({ where: { consultationId: id, status: 'PENDING' } }) ??
        await tx.enrollmentPayment.create({ data: { userId, consultationId: id, amountPaise: a.feePaise, currency: a.currency, provider: 'development' } });
      return { id: payment.id, amountPaise: payment.amountPaise, currency: payment.currency, mode: payment.provider };
    });
  }
  async settle(userId: string, paymentId: string, outcome: 'capture' | 'fail') {
    const p = await this.db.enrollmentPayment.findFirst({ where: { id: paymentId, userId, consultationId: { not: null } } });
    if (!p?.consultationId) throw missing();
    const owned = await this.owned(userId, p.consultationId);
    const newlyConfirmed = await this.db.$transaction(async tx => {
      await this.lock(tx, owned.doctorId);
      const a = await this.owned(userId, owned.id, tx);
      const payment = await tx.enrollmentPayment.findUniqueOrThrow({ where: { id: paymentId } });
      if (!a.doctor.isDemo || this.env.DEMO_CONSULTATIONS !== 'true' || payment.provider !== 'development') throw missing();
      const provider = new DevelopmentPaymentProvider(this.env, payment, outcome);
      if (payment.status !== 'PENDING') return false;
      if (a.status !== 'PENDING_PAYMENT') throw new ApiError(409, 'BOOKING_EXPIRED', 'This booking is no longer available for payment.');
      await this.doctor(a.doctorId, tx);
      const receipt = await provider.verify(paymentId);
      const verified = receiptMatches(payment, receipt);
      await tx.enrollmentPayment.update({ where: { id: paymentId }, data: { status: verified ? 'VERIFIED' : 'FAILED', providerReference: receipt.reference, verifiedAt: verified ? new Date() : null } });
      if (verified) {
        await tx.consultation.update({ where: { id: a.id }, data: { status: 'CONFIRMED' } });
        await this.reminders(tx, a.id, a.startsAt);
      }
      return verified;
    });
    if (newlyConfirmed) this.event('booking_completed');
    return this.detailFor(userId, owned.id);
  }
  private policy(a: Appointment) {
    if (!['PENDING_PAYMENT', 'CONFIRMED'].includes(a.status) || (a.status === 'CONFIRMED' && a.startsAt.getTime() - Date.now() < this.env.CANCELLATION_WINDOW_MINUTES * 60000)) {
      throw new ApiError(409, 'POLICY_WINDOW_CLOSED', 'This appointment can no longer be changed. Please contact support.');
    }
  }
  async cancel(userId: string, id: string) {
    const owned = await this.owned(userId, id);
    await this.db.$transaction(async tx => {
      await this.lock(tx, owned.doctorId);
      const a = await this.owned(userId, id, tx);
      if (a.status === 'CANCELLED') return;
      this.policy(a);
      await tx.consultation.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(),
        refundStatus: a.payments.some(p => p.status === 'VERIFIED') ? 'REVIEW_REQUIRED' : 'NOT_REQUIRED' } });
      await tx.consultationReminder.updateMany({ where: { consultationId: id }, data: { status: 'CANCELLED' } });
    });
    this.event('booking_cancelled');
    return this.detailFor(userId, id);
  }
  async reschedule(userId: string, id: string, date: string, startsAt: string) {
    const owned = await this.owned(userId, id);
    await this.db.$transaction(async tx => {
      await this.lock(tx, owned.doctorId);
      const a = await this.owned(userId, id, tx);
      this.policy(a);
      const { slots } = await this.available(a.doctorId, date, tx, id);
      const slot = slots.find(s => s.startsAt.toISOString() === new Date(startsAt).toISOString());
      if (!slot || slot.endsAt.getTime() - slot.startsAt.getTime() !== a.endsAt.getTime() - a.startsAt.getTime()) throw unavailable();
      await tx.consultation.update({ where: { id }, data: { ...slot, rescheduledAt: new Date() } });
      if (a.status === 'CONFIRMED') await this.reminders(tx, id, slot.startsAt);
    });
    return this.detailFor(userId, id);
  }
  async assignedDoctor(userId: string) {
    const doctor = await this.db.doctor.findUnique({ where: { userId } });
    if (!doctor || doctor.verificationStatus !== 'VERIFIED' || (doctor.isDemo && this.env.DEMO_CONSULTATIONS !== 'true')) throw new ApiError(403, 'FORBIDDEN', 'A verified doctor account is required.');
    return doctor;
  }
  async doctorAppointments(userId: string) {
    const doctor = await this.assignedDoctor(userId);
    return (await this.db.consultation.findMany({ where: { doctorId: doctor.id }, include: appointmentInclude, orderBy: { startsAt: 'desc' }, take: 100 })).map(a => this.dto(a, true));
  }
  async availability(userId: string) {
    const d = await this.assignedDoctor(userId);
    return { timezone: d.timezone, consultationMinutes: d.consultationMinutes, bufferMinutes: d.bufferMinutes,
      acceptingAppointments: d.acceptingAppointments,
      windows: await this.db.doctorAvailability.findMany({ where: { doctorId: d.id }, select: { weekday: true, startMinute: true, endMinute: true } }),
      excludedDates: (await this.db.doctorAvailabilityException.findMany({ where: { doctorId: d.id } })).map(e => e.localDate) };
  }
  async updateAvailability(userId: string, input: AvailabilityInput) {
    const d = await this.assignedDoctor(userId);
    await this.db.$transaction(async tx => {
      await this.lockAssigned(tx, d.id, userId);
      const { windows, excludedDates, ...settings } = input;
      await tx.doctor.update({ where: { id: d.id }, data: settings });
      await tx.doctorAvailability.deleteMany({ where: { doctorId: d.id } });
      await tx.doctorAvailabilityException.deleteMany({ where: { doctorId: d.id } });
      await tx.doctorAvailability.createMany({ data: windows.map(w => ({ ...w, doctorId: d.id })) });
      await tx.doctorAvailabilityException.createMany({ data: [...new Set(excludedDates)].map(localDate => ({ doctorId: d.id, localDate })) });
    });
    return this.availability(userId);
  }
  async profile(userId: string, input?: { biography: string; languages: string[] }) {
    const d = await this.assignedDoctor(userId);
    if (!input) return doctorDto(d);
    return this.db.$transaction(async tx => {
      await this.lockAssigned(tx, d.id, userId);
      return doctorDto(await tx.doctor.update({ where: { id: d.id }, data: input }));
    });
  }
  async notes(userId: string, id: string, input: { privateNote: string; summary: string; followUpRequired: boolean; followUpDate: string | null; followUpNote: string }) {
    const doctor = await this.assignedDoctor(userId);
    await this.db.$transaction(async tx => {
      await this.lockAssigned(tx, doctor.id, userId);
      const a = await tx.consultation.findFirst({ where: { id, doctorId: doctor.id } });
      if (!a) throw missing();
      if (!['IN_PROGRESS', 'COMPLETED'].includes(a.status)) throw new ApiError(409, 'INVALID_STATE', 'Notes are available during or after a consultation.');
      await tx.consultationNote.upsert({ where: { consultationId: id }, create: { consultationId: id, ...input }, update: input });
    });
    return { saved: true };
  }
  async transition(userId: string, id: string, action: 'start' | 'complete' | 'no-show') {
    const doctor = await this.assignedDoctor(userId);
    await this.db.$transaction(async tx => {
      await this.lockAssigned(tx, doctor.id, userId);
      const a = await tx.consultation.findFirst({ where: { id, doctorId: doctor.id } });
      if (!a) throw missing();
      // No real visit can be started without a configured provider. Demo lifecycle
      // allows testing records without claiming that a medical consultation occurred.
      if (!doctor.isDemo || this.env.DEMO_CONSULTATIONS !== 'true') throw new ApiError(503, 'PROVIDER_UNAVAILABLE', 'Consultation connection is not available yet.');
      const next = action === 'start' ? 'IN_PROGRESS' : action === 'complete' ? 'COMPLETED' : 'NO_SHOW';
      if (a.status === next) return;
      if ((action === 'complete' && a.status !== 'IN_PROGRESS') || (action !== 'complete' && a.status !== 'CONFIRMED') || (action === 'no-show' && a.endsAt > new Date()) || (action === 'start' && (a.startsAt.getTime() > Date.now() + 10 * 60000 || a.endsAt <= new Date()))) throw new ApiError(409, 'INVALID_STATE', 'This action is not available for this appointment.');
      await tx.consultation.update({ where: { id }, data: { status: next, ...(next === 'COMPLETED' ? { completedAt: new Date() } : {}) } });
    });
    return { saved: true };
  }
}
