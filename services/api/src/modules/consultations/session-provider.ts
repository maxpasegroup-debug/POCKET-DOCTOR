import { ApiError } from '../../errors/api-error.js';

// Resolve only after identity, appointment assignment, payment and time-window
// checks. Tokens must be short-lived and scoped to one participant/session.
export interface ConsultationSessionProvider {
  createAccess(input: { consultationId: string; participantId: string; role: 'patient' | 'doctor'; expiresAt: Date }): Promise<{ token: string; expiresAt: Date }>;
}
export class UnavailableConsultationProvider implements ConsultationSessionProvider {
  async createAccess(): Promise<never> {
    throw new ApiError(503, 'PROVIDER_UNAVAILABLE', 'Consultation connection is not available yet.');
  }
}
