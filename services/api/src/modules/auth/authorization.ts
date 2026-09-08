import type { FastifyRequest } from 'fastify';
import { ApiError } from '../../errors/api-error.js';
import type { Principal, Role, SessionVerifier } from './contracts.js';

export async function authenticate(request: FastifyRequest, verifier: SessionVerifier): Promise<Principal> {
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? '');
  const token = match?.[1];
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
  const principal = await verifier.verify(token);
  if (!principal) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
  return principal;
}

// Role checks are only one layer. Future resources also require ownership,
// doctor assignment and consent checks in their application services.
export function authorize(principal: Principal, allowed: readonly Role[]): void {
  if (!principal.roles.some(role => allowed.includes(role))) {
    throw new ApiError(403, 'FORBIDDEN', 'Access denied.');
  }
}
