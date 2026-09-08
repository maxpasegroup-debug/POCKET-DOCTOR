import { z } from 'zod';
import { ApiError } from '../../errors/api-error.js';
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'INVALID_REQUEST', 'Please check the required fields.');
  return result.data;
}
export const pagination = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1), q: z.string().trim().max(100).default('') }).strict();
const text = (max: number) => z.string().trim().min(1).max(max);
export const doctorInput = z.object({ name: text(100), qualification: text(200), specialty: text(100), biography: text(2000),
  experienceYears: z.number().int().min(0).max(80).nullable(), languages: z.array(text(40)).min(1).max(10),
  feePaise: z.number().int().min(0).max(1000000), acceptingAppointments: z.boolean(),
  verificationStatus: z.enum(['PENDING_VERIFICATION', 'VERIFIED', 'SUSPENDED', 'INACTIVE', 'REJECTED']),
  registrationAuthority: text(200).nullable(), registrationNumber: text(200).nullable(),
}).strict().refine(d => d.verificationStatus !== 'VERIFIED' || (!!d.registrationAuthority && !!d.registrationNumber), 'Verification requires registration evidence');
export const programInput = z.object({ title: text(200), description: text(10000), audience: text(3000), outcomes: z.array(text(500)).max(20),
  categoryId: text(60), doctorId: z.string().uuid(), type: z.enum(['RECORDED', 'LIVE']), durationMinutes: z.number().int().min(1).max(100000),
  pricePaise: z.number().int().min(0).max(10000000), level: text(40), membershipOnly: z.boolean(), featured: z.boolean(),
  publicationStatus: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']), coverUrl: z.url().refine(v => new URL(v).protocol === 'https:').nullable(),
}).strict();
export const moduleInput = z.object({ title: text(200), position: z.number().int().min(0).max(1000) }).strict();
export const lessonInput = z.object({ title: text(200), description: text(10000), position: z.number().int().min(0).max(1000),
  durationSeconds: z.number().int().min(1).max(86400), required: z.boolean(), mediaRef: text(500).nullable(),
  keyPoints: z.array(text(500)).max(30), supportingMaterial: z.string().max(10000) }).strict();
export const liveInput = z.object({ title: text(200), startsAt: z.iso.datetime({ offset: true }).transform(v => new Date(v)),
  durationMinutes: z.number().int().min(1).max(1440), information: text(3000), providerRef: text(300).nullable() }).strict();
