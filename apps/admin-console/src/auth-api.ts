import type { ApiClient } from './api.ts';

export interface AdminChallenge {
  challengeId: string;
  developmentCode?: string;
  delivery?: 'testing' | 'development' | 'provider';
}

export function requestAdminOtp(api: ApiClient, phone: string) {
  return api.request<AdminChallenge>('/auth/otp/request', 'POST', { phone, context: 'ADMIN' });
}

export function verifyAdminOtp(api: ApiClient, challengeId: string, code: string) {
  return api.request<{ token: string; user: { roles: string[] } }>('/auth/otp/verify', 'POST', { challengeId, code, context: 'ADMIN' });
}

export function adminOtpPreview(challenge: AdminChallenge, localDevelopment: boolean, automaticCheck = false): string | undefined {
  if (!challenge.developmentCode || !/^\d{6}$/.test(challenge.developmentCode)) return undefined;
  if (challenge.delivery === 'testing') return `Staging test code: ${challenge.developmentCode}. No SMS was sent. ${automaticCheck ? 'Continue to your Admin workspace.' : 'An authenticator code is still required.'}`;
  if (localDevelopment && challenge.delivery !== 'provider') return `Local development code: ${challenge.developmentCode}. No SMS was sent.`;
  return undefined;
}
