import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { authenticate } from './authorization.js';
import { IdentityService } from './identity-service.js';
import { profileInput } from './profile.js';

export function registerIdentityRoutes(app: FastifyInstance, env: Environment, prisma?: PrismaClient) {
  const identity = prisma ? new IdentityService(prisma, env) : undefined;
  const service = () => {
    if (!identity) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'We could not connect right now. Please try again later.');
    return identity;
  };
  app.post<{ Body: { phone: string; context?: 'DOCTOR' } }>('/api/v1/auth/otp/request', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { body: { type: 'object', additionalProperties: false, required: ['phone'], properties: { phone: { type: 'string', pattern: '^\\+91[6-9][0-9]{9}$' }, context: { type: 'string', enum: ['DOCTOR'] } } } },
  }, async request => ({ data: await service().requestOtp(request.body.phone, request.body.context === 'DOCTOR' ? 'DOCTOR_LOGIN' : 'LOGIN') }));
  app.post<{ Body: { challengeId: string; code: string; context?: 'DOCTOR' } }>('/api/v1/auth/otp/verify', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: { body: { type: 'object', additionalProperties: false, required: ['challengeId', 'code'], properties: {
      challengeId: { type: 'string', format: 'uuid' }, code: { type: 'string', pattern: '^[0-9]{6}$' }, context: { type: 'string', enum: ['DOCTOR'] },
    } } },
  }, async request => ({ data: await service().verifyOtp(request.body.challengeId, request.body.code, request.id, request.body.context === 'DOCTOR' ? 'DOCTOR_LOGIN' : 'LOGIN') }));
  for (const path of ['/api/v1/auth/session', '/api/v1/users/me']) {
    app.get(path, async request => {
      const instance = service();
      return { data: { user: await instance.getUser(await authenticate(request, instance)) } };
    });
  }
  app.patch('/api/v1/users/me', async request => {
    const instance = service();
    const principal = await authenticate(request, instance);
    const input = profileInput.safeParse(request.body);
    if (!input.success) throw new ApiError(400, 'INVALID_PROFILE', 'Please check your name, language and wellness interests.');
    return { data: { user: await instance.updateProfile(principal, input.data) } };
  });
  app.post('/api/v1/auth/logout', async request => {
    const instance = service();
    const principal = await authenticate(request, instance);
    await instance.logout(principal);
    return { data: { loggedOut: true } };
  });
}
