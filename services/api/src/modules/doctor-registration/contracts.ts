import { z } from 'zod';
import { ApiError } from '../../errors/api-error.js';
export const kinds = ['QUALIFICATION', 'REGISTRATION', 'IDENTITY', 'ADDITIONAL', 'PROFILE_PHOTO'] as const;
export type CredentialKind = typeof kinds[number];
export const maxDocumentBytes = 5 * 1024 * 1024;
export interface PrivateCredentialStore {
  readonly available: boolean;
  // Implementation must use private objects, encryption at rest, malware scanning,
  // no public ACL, no public URLs; return only after the object is safely stored.
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export interface RegistrationDependencies {
  deferDocuments?: boolean;
  store?: PrivateCredentialStore;
  requiredKinds?: readonly CredentialKind[];
}
const text = (max: number) => z.string().trim().max(max);
export const draftInput = z.object({
  name: text(100), registrationEmail: z.union([z.literal(''), z.email().max(254)]),
  registrationDateOfBirth: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
    const d = new Date(v + 'T00:00:00Z'); return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v && +d <= Date.now();
  })]),
  registrationGender: z.enum(['', 'FEMALE', 'MALE', 'OTHER', 'PREFER_NOT_TO_SAY']),
  qualification: text(200), specialty: text(100), biography: text(2000),
  registrationAuthority: text(200), registrationNumber: text(200),
  experienceYears: z.number().int().min(0).max(80).nullable(),
  languages: z.array(z.string().trim().min(1).max(40)).max(10),
  feePaise: z.number().int().min(0).max(1000000),
}).strict();
export const uploadInput = z.object({
  replaceDocumentId: z.string().uuid().optional(),
  kind: z.enum(kinds), fileName: z.string().trim().min(1).max(120).regex(/^[^/\\\x00-\x1f]+$/),
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  contentBase64: z.string().min(4).max(Math.ceil(maxDocumentBytes / 3) * 4),
}).strict();
export function documentBytes(input: z.infer<typeof uploadInput>) {
  if (input.contentBase64.length > Math.ceil(maxDocumentBytes / 3) * 4) throw new ApiError(400, 'INVALID_DOCUMENT', 'Choose a file up to 5 MB.');
  const bytes = Buffer.from(input.contentBase64, 'base64');
  if (bytes.toString('base64') !== input.contentBase64) throw new ApiError(400, 'INVALID_DOCUMENT', 'Choose a valid PDF, JPEG or PNG file.');
  const valid = input.contentType === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' :
    input.contentType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
    bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!valid || bytes.length > maxDocumentBytes || (input.kind === 'PROFILE_PHOTO' && input.contentType === 'application/pdf')) throw new ApiError(400, 'INVALID_DOCUMENT', 'Choose a matching PDF, JPEG or PNG file up to 5 MB. Photos must be images.');
  return bytes;
}
