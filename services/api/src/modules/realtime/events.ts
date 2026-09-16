import type { Doctor } from '../../generated/prisma/client.js';

export interface PatientEventPublisher {
  doctorAvailable(id: string): Promise<void>;
}
export const noPatientEvents: PatientEventPublisher = { async doctorAvailable() {} };

// Only non-demo doctors satisfying the existing public discovery predicate.
export function publiclyAvailable(doctor: Pick<Doctor, 'verificationStatus' | 'acceptingAppointments' | 'isDemo'>) {
  return doctor.verificationStatus === 'VERIFIED' && doctor.acceptingAppointments && !doctor.isDemo;
}
export function doctorAvailableEvent(doctor: Pick<Doctor, 'id' | 'name' | 'specialty' | 'photoUrl'>) {
  // Explicit allowlist: never spread a database model into a wire payload.
  return { type: 'DOCTOR_AVAILABLE' as const, doctor: {
    id: doctor.id, name: doctor.name, specialization: doctor.specialty, profileImage: doctor.photoUrl,
  } };
}
