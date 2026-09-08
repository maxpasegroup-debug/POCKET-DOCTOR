export type Role = 'USER' | 'DOCTOR' | 'ADMIN';

export interface Principal {
  readonly userId: string;
  readonly sessionId: string;
  readonly roles: readonly Role[];
}

// Opaque sessions are validated against a hash, expiry and server revocation.
// A future JWT adapter would also verify signature, issuer and audience.
// Never construct a principal from unverified payloads or client-supplied roles.
export interface SessionVerifier {
  verify(accessToken: string): Promise<Principal | null>;
}

export const unavailableSessionVerifier: SessionVerifier = {
  async verify() { return null; },
};
