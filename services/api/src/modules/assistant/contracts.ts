import { z } from 'zod';
import { ApiError } from '../../errors/api-error.js';

export const intents = ['membership', 'general', 'sleep', 'routine', 'programs', 'consultations', 'orders', 'products', 'goals', 'reminders', 'prepare', 'doctor', 'emergency', 'privacy'] as const;
export const decisionSchema = z.object({ intent: z.enum(intents) }).strict();
export type Decision = z.infer<typeof decisionSchema>;
export const messageInput = z.object({ text: z.string().trim().min(1).max(2000), requestKey: z.string().uuid() }).strict();
export const memoryInput = z.object({ text: z.string().trim().min(1).max(300) }).strict();
const date = z.iso.date().transform(v => new Date(`${v}T00:00:00Z`));
export const goalInput = z.object({ title: z.string().trim().min(1).max(120), target: z.string().trim().min(1).max(120), startDate: date,
  targetDate: date.nullable().default(null), progress: z.number().int().min(0).max(100).default(0), status: z.enum(['ACTIVE', 'COMPLETED', 'PAUSED']).default('ACTIVE') }).strict()
  .refine(v => !v.targetDate || v.targetDate >= v.startDate)
  .refine(v => (v.status === 'COMPLETED') === (v.progress === 100));
export const checkInInput = z.object({ date, mood: z.enum(['Good', 'Okay', 'Low', 'Prefer not to say']), energy: z.number().int().min(1).max(5),
  sleepHours: z.number().min(0).max(24).nullable().default(null), waterMl: z.number().int().min(0).max(20000).nullable().default(null),
  activityMinutes: z.number().int().min(0).max(1440).nullable().default(null), weightKg: z.number().min(1).max(700).nullable().default(null), habitCompleted: z.boolean().default(false) }).strict();
export const reminderInput = z.object({ title: z.string().trim().min(1).max(120), kind: z.enum(['WELLNESS', 'PROGRAM', 'CONSULTATION', 'PERSONAL']),
  dueAt: z.iso.datetime({ offset: true }).transform(v => new Date(v)), completed: z.boolean().default(false) }).strict();
export const preferenceInput = z.object({ providerConsent: z.boolean(), useMemory: z.boolean(), appReminders: z.boolean(), whatsappReminders: z.boolean(),
  programReminders: z.boolean(), consultationReminders: z.boolean(), wellnessReminders: z.boolean() }).strict();
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new ApiError(400, 'INVALID_REQUEST', 'Please check your details.');
  return r.data;
}
export type AssistantReply = { text: string; classification: 'support' | 'doctor' | 'emergency' | 'privacy';
  actions: { label: string; route: string }[]; facts: { label: string; value: string; route: string }[]; mode: string };
