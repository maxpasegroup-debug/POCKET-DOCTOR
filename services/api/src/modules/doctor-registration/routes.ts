import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { z } from 'zod';
import { ApiError } from '../../errors/api-error.js';
import { IdentityService } from '../auth/identity-service.js';
import { authenticate, authorize } from '../auth/authorization.js';
import { adminActor } from '../admin/security.js';
import { parse } from '../admin/contracts.js';
import { RegistrationService } from './service.js';
import { draftInput, uploadInput, type RegistrationDependencies } from './contracts.js';
import { noPatientEvents, type PatientEventPublisher } from '../realtime/events.js';
export function registerDoctorRegistrationRoutes(app: FastifyInstance, env: Environment, db?: PrismaClient, dependencies: RegistrationDependencies = {}, events: PatientEventPublisher = noPatientEvents) {
  const identity = db ? new IdentityService(db,env) : undefined;
  const service = db ? new RegistrationService(db,dependencies,events) : undefined;
  function ready() { if (!identity || !service) throw new ApiError(503,'SERVICE_UNAVAILABLE','Registration is temporarily unavailable.'); return {identity,service}; }
  async function owner(r: FastifyRequest) { const s=ready(); const actor=await authenticate(r,s.identity); authorize(actor,['DOCTOR']); return { ...s, actor }; }
  const base='/api/v1/doctor/registration';
  app.post(base+'/otp/request',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async r=>{
    const {phone}=parse(z.object({phone:z.string().regex(/^\+91[6-9][0-9]{9}$/)}).strict(),r.body);
    return {data:await ready().identity.requestOtp(phone,'DOCTOR_REGISTRATION')};
  });
  app.post(base+'/otp/verify',{config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async r=>{
    const {challengeId,code}=parse(z.object({challengeId:z.string().uuid(),code:z.string().regex(/^\d{6}$/)}).strict(),r.body);
    return {data:await ready().identity.verifyOtp(challengeId,code,r.id,'DOCTOR_REGISTRATION')};
  });
  app.get(base,async r=>{const {service,actor}=await owner(r);return {data:await service.view(actor.userId)};});
  app.patch(base,async r=>{const {service,actor}=await owner(r);return {data:await service.save(actor.userId,parse(draftInput,r.body))};});
  app.post(base+'/submit',async r=>{const {service,actor}=await owner(r);parse(z.object({}).strict(),r.body??{});return {data:await service.submit(actor.userId)};});
  app.post(base+'/documents',{bodyLimit:7*1024*1024,config:{rateLimit:{max:6,timeWindow:'1 minute'}}},async r=>{
    const {service,actor}=await owner(r);return {data:await service.upload(actor.userId,parse(uploadInput,r.body))};
  });
  app.get(base+'/documents/:documentId',async r=>{
    const {service,actor}=await owner(r);const {documentId}=parse(z.object({documentId:z.string().uuid()}),r.params);
    const application=await service.view(actor.userId);
    if(['SUSPENDED','INACTIVE'].includes(application.status))throw new ApiError(403,'FORBIDDEN','Doctor access is blocked.');
    return {data:await service.document(application.id,documentId,actor.userId)};
  });
  app.delete(base+'/documents/:documentId',async r=>{const {service,actor}=await owner(r);const {documentId}=parse(z.object({documentId:z.string().uuid()}),r.params);return {data:await service.remove(actor.userId,documentId)};});
  const admin='/api/v1/admin/operations/doctors/:id/registration';
  const doctorId=(r:FastifyRequest)=>parse(z.object({id:z.string().uuid(),documentId:z.string().uuid().optional()}),r.params);
  app.get(admin,async r=>{adminActor(r);return {data:await ready().service.adminView(doctorId(r).id)};});
  app.post(admin+'/review',async r=>{
    const actor=adminActor(r);const input=parse(z.object({action:z.enum(['BEGIN_REVIEW','APPROVE','REJECT','SUSPEND']),reason:z.string().trim().max(2000).default('')}).strict(),r.body);
    return {data:await ready().service.review(doctorId(r).id,input.action,input.reason,actor.userId,r.id)};
  });
  app.get(admin+'/documents/:documentId',async r=>{adminActor(r);const p=doctorId(r);return {data:await ready().service.document(p.id,p.documentId!)};});
}
