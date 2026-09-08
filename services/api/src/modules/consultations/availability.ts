import { z } from 'zod';

export const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
export const availabilityInput = z.object({
  timezone: z.string().max(80).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }),
  consultationMinutes: z.number().int().min(10).max(120),
  bufferMinutes: z.number().int().min(0).max(60),
  acceptingAppointments: z.boolean(),
  windows: z.array(z.object({ weekday: z.number().int().min(1).max(7), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440) }).strict()).max(28),
  excludedDates: z.array(localDate).max(120),
}).strict().superRefine((value, ctx) => {
  for (const [index, window] of value.windows.entries()) {
    if (window.endMinute - window.startMinute < value.consultationMinutes || value.windows.some((other, i) => i < index && other.weekday === window.weekday && other.startMinute < window.endMinute && other.endMinute > window.startMinute)) {
      ctx.addIssue({ code: 'custom', path: ['windows'], message: 'Use non-overlapping windows that fit a consultation.' });
    }
  }
});
export type AvailabilityInput = z.infer<typeof availabilityInput>;

// Enumerating UTC instants avoids guessing offsets around DST transitions.
// Ambiguous local times retain distinct UTC IDs; display includes the offset.
export function generateSlots(date: string, config: Pick<AvailabilityInput, 'timezone' | 'consultationMinutes' | 'bufferMinutes' | 'windows' | 'excludedDates'>, now = new Date()) {
  if (config.excludedDates.includes(date)) return [];
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const midnight = Date.parse(`${date}T00:00:00Z`);
  const weekday = new Date(midnight).getUTCDay() || 7;
  const windows = config.windows.filter(w => w.weekday === weekday);
  const slots: { startsAt: Date; endsAt: Date; reservedUntil: Date }[] = [];
  for (let time = midnight - 14 * 3600000; time < midnight + 38 * 3600000; time += 60000) {
    if (time < now.getTime() + 15 * 60000) continue;
    const parts = Object.fromEntries(format.formatToParts(time).map(p => [p.type, p.value]));
    if (`${parts.year}-${parts.month}-${parts.day}` !== date) continue;
    const minute = Number(parts.hour) * 60 + Number(parts.minute);
    if (!windows.some(w => minute >= w.startMinute && minute + config.consultationMinutes <= w.endMinute && (minute - w.startMinute) % (config.consultationMinutes + config.bufferMinutes) === 0)) continue;
    const endsAt = new Date(time + config.consultationMinutes * 60000);
    // Reject slots crossing a clock transition or the configured local window.
    const endParts = Object.fromEntries(format.formatToParts(endsAt).map(p => [p.type, p.value]));
    const expectedEnd = minute + config.consultationMinutes;
    const expectedLocalEnd = new Date(midnight + expectedEnd * 60000);
    if (`${endParts.year}-${endParts.month}-${endParts.day}` !== expectedLocalEnd.toISOString().slice(0, 10) || Number(endParts.hour) * 60 + Number(endParts.minute) !== expectedEnd % 1440) continue;
    slots.push({ startsAt: new Date(time), endsAt, reservedUntil: new Date(endsAt.getTime() + config.bufferMinutes * 60000) });
  }
  return slots;
}
