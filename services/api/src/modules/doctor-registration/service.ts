import { randomUUID } from 'node:crypto';
import type { PrismaClient, Doctor, Prisma } from '../../generated/prisma/client.js';
import type { z } from 'zod';
import { ApiError } from '../../errors/api-error.js';
import { draftInput, documentBytes, maxDocumentBytes, type RegistrationDependencies, type uploadInput } from './contracts.js';
type Tx = Prisma.TransactionClient;
const notFound = () => new ApiError(404, 'NOT_FOUND', 'Application or document not found.');
export function registrationStatus(d: Doctor) {
  if (d.verificationStatus !== 'PENDING_VERIFICATION') return d.verificationStatus;
  return d.registrationReviewStartedAt ? 'UNDER_REVIEW' : d.registrationSubmittedAt ? 'SUBMITTED' : 'DRAFT';
}
export class RegistrationService {
  constructor(private db: PrismaClient, private dependencies: RegistrationDependencies = {}) {}
  private storage() {
    if (!this.dependencies.store?.available) throw new ApiError(503, 'PRIVATE_STORAGE_UNAVAILABLE', 'Secure document storage is not configured. Your draft is safe; please try again later.');
    return this.dependencies.store;
  }
  private policy() {
    if (!this.dependencies.requiredKinds?.length) throw new ApiError(503, 'DOCUMENT_POLICY_UNAVAILABLE', 'The document review policy is not configured. Your draft is safe.');
    return this.dependencies.requiredKinds;
  }
  private async owner(userId: string, tx: Tx = this.db) {
    const d = await tx.doctor.findUnique({ where: { userId } });
    if (!d || !d.registrationStartedAt) throw notFound();
    return d;
  }
  private async lock(id: string, tx: Tx) {
    await tx.$queryRaw`SELECT "id" FROM "Doctor" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const d = await tx.doctor.findUnique({ where: { id } }); if (!d || !d.registrationStartedAt) throw notFound(); return d;
  }
  private editable(d: Doctor) {
    if (!['DRAFT', 'REJECTED'].includes(registrationStatus(d))) throw new ApiError(409, 'APPLICATION_LOCKED', 'This application cannot be edited in its current state.');
  }
  async view(userId: string) { return this.dto(await this.owner(userId)); }
  async adminView(id: string) {
    const d = await this.db.doctor.findUnique({ where: { id } }); if (!d || !d.registrationStartedAt) throw notFound(); return this.dto(d);
  }
  private async dto(d: Doctor) {
    const user = d.userId ? await this.db.user.findUnique({ where: { id: d.userId }, select: { phone: true } }) : null;
    const documents = await this.db.doctorCredential.findMany({ where: { doctorId: d.id }, select: { id: true, kind: true, fileName: true, contentType: true, size: true, createdAt: true }, orderBy: { createdAt: 'asc' } });
    return { id: d.id, status: registrationStatus(d), verificationStatus: d.verificationStatus, phone: user?.phone,
      submittedAt: d.registrationSubmittedAt, reviewedAt: d.registrationReviewedAt, rejectionReason: d.registrationRejectionReason,
      profile: { name: d.name, registrationEmail: d.registrationEmail ?? '', registrationDateOfBirth: d.registrationDateOfBirth ?? '', registrationGender: d.registrationGender ?? '',
        qualification: d.qualification, specialty: d.specialty, biography: d.biography, registrationAuthority: d.registrationAuthority ?? '', registrationNumber: d.registrationNumber ?? '', experienceYears: d.experienceYears,
        languages: d.languages, feePaise: d.feePaise }, documents,
      documentPolicy: { deferred: this.dependencies.deferDocuments === true, configured: !!this.dependencies.requiredKinds?.length, requiredKinds: this.dependencies.requiredKinds ?? [], maxBytes: maxDocumentBytes, contentTypes: ['application/pdf','image/jpeg','image/png'], storageAvailable: !!this.dependencies.store?.available },
      consultationTypes: ['RESERVATION'], editable: ['DRAFT','REJECTED'].includes(registrationStatus(d)) };
  }
  async save(userId: string, input: z.infer<typeof draftInput>) {
    const old = await this.owner(userId);
    await this.db.$transaction(async tx => {
      const d = await this.lock(old.id, tx); this.editable(d);
      await tx.doctor.update({ where: { id: d.id }, data: input });
    }); return this.view(userId);
  }
  async upload(userId: string, input: z.infer<typeof uploadInput>) {
    const d = await this.owner(userId); this.editable(d);
    const bytes = documentBytes(input); const store = this.storage();
    const key = `doctor-credentials/${d.id}/${randomUUID()}`;
    await store.put(key, bytes, input.contentType);
    let replacedKey: string | undefined;
    try {
      await this.db.$transaction(async tx => {
        this.editable(await this.lock(d.id, tx));
        const old = input.replaceDocumentId ? await tx.doctorCredential.findFirst({where:{id:input.replaceDocumentId,doctorId:d.id,kind:input.kind}}) : null;
        if(input.replaceDocumentId && !old) throw notFound();
        if(old){replacedKey=old.objectKey;await tx.doctorCredential.delete({where:{id:old.id}});}
        if (await tx.doctorCredential.count({ where: { doctorId: d.id } }) >= 10) throw new ApiError(409, 'DOCUMENT_LIMIT', 'Remove an old document before adding another.');
        await tx.doctorCredential.create({ data: { doctorId: d.id, kind: input.kind, fileName: input.fileName, contentType: input.contentType, size: bytes.length, objectKey: key } });
      });
    } catch (error) { await store.remove(key).catch(() => {}); throw error; }
    if(replacedKey) await store.remove(replacedKey).catch(()=>{});
    return this.view(userId);
  }
  async remove(userId: string, documentId: string) {
    const d = await this.owner(userId); let key = '';
    await this.db.$transaction(async tx => {
      this.editable(await this.lock(d.id, tx));
      const doc = await tx.doctorCredential.findFirst({ where: { id: documentId, doctorId: d.id } }); if (!doc) throw notFound();
      key = doc.objectKey; await tx.doctorCredential.delete({ where: { id: doc.id } });
    });
    // Private orphan cleanup may be retried by the storage integration; never expose a URL.
    if (key && this.dependencies.store?.available) await this.dependencies.store.remove(key).catch(() => {});
    return this.view(userId);
  }
  async document(doctorId: string, documentId: string, userId?: string) {
    if (userId && (await this.owner(userId)).id !== doctorId) throw notFound();
    const doc = await this.db.doctorCredential.findFirst({ where: { id: documentId, doctorId } }); if (!doc) throw notFound();
    const bytes = await this.storage().read(doc.objectKey);
    return { id: doc.id, fileName: doc.fileName, contentType: doc.contentType, contentBase64: bytes.toString('base64') };
  }
  private async complete(d: Doctor, tx: Tx) {
    const profile = draftInput.safeParse({ name:d.name, registrationEmail:d.registrationEmail ?? '', registrationDateOfBirth:d.registrationDateOfBirth ?? '', registrationGender:d.registrationGender ?? '', qualification:d.qualification, specialty:d.specialty, biography:d.biography, registrationAuthority:d.registrationAuthority ?? '', registrationNumber:d.registrationNumber ?? '', experienceYears:d.experienceYears, languages:d.languages, feePaise:d.feePaise });
    if (!profile.success || !d.name.trim() || !d.registrationEmail || !d.qualification.trim() || !d.specialty.trim() || !d.biography.trim() || !d.registrationAuthority?.trim() || !d.registrationNumber?.trim() || d.experienceYears === null || !d.languages.length) throw new ApiError(400, 'APPLICATION_INCOMPLETE', 'Complete your name, email, professional details, languages and registration information.');
    if (this.dependencies.deferDocuments === true) return;
    this.storage(); const required = this.policy();
    const docs = await tx.doctorCredential.findMany({ where: { doctorId: d.id }, select: { kind: true } });
    if (required.some(kind => !docs.some(doc => doc.kind === kind))) throw new ApiError(400, 'DOCUMENTS_REQUIRED', 'Upload the documents required by the platform review policy.');
  }
  async submit(userId: string) {
    const old = await this.owner(userId);
    await this.db.$transaction(async tx => {
      const d = await this.lock(old.id, tx); this.editable(d); await this.complete(d, tx);
      await tx.doctor.update({ where: { id:d.id }, data: { verificationStatus:'PENDING_VERIFICATION', registrationSubmittedAt:new Date(), registrationReviewStartedAt:null, registrationReviewedAt:null, registrationRejectionReason:null, acceptingAppointments:false, verifiedAt:null } });
    }); return this.view(userId);
  }
  async review(id: string, action: 'BEGIN_REVIEW'|'APPROVE'|'REJECT'|'SUSPEND', reason: string, actorId: string, requestId: string) {
    await this.db.$transaction(async tx => {
      const d = await this.lock(id, tx); const status = registrationStatus(d);
      if (action === 'SUSPEND') {
        if (status !== 'VERIFIED') throw new ApiError(409,'INVALID_STATE','Only a verified doctor can be suspended.');
        await tx.doctor.update({ where:{id}, data:{verificationStatus:'SUSPENDED', acceptingAppointments:false} });
      } else {
        if (!['SUBMITTED','UNDER_REVIEW'].includes(status)) throw new ApiError(409,'INVALID_STATE','Only a submitted application can be reviewed.');
        if (action === 'APPROVE') {
          await this.complete(d,tx);
          await tx.doctor.update({where:{id},data:{verificationStatus:'VERIFIED',verifiedAt:new Date(),registrationReviewedAt:new Date(),registrationRejectionReason:null}});
        } else if (action === 'REJECT') {
          if (!reason.trim()) throw new ApiError(400,'REASON_REQUIRED','Provide a correction reason.');
          await tx.doctor.update({where:{id},data:{verificationStatus:'REJECTED',registrationReviewedAt:new Date(),registrationRejectionReason:reason.trim(),acceptingAppointments:false,verifiedAt:null}});
        } else await tx.doctor.update({where:{id},data:{registrationReviewStartedAt:new Date()}});
      }
      await tx.adminAuditEvent.create({data:{actorId,action:`DOCTOR_APPLICATION_${action}`,resourceId:id,requestId,result:'SUCCEEDED'}});
    }); return this.adminView(id);
  }
}
