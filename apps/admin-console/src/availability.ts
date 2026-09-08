import { StaleRequest } from './api.ts';
import type { RecordData } from './catalog.ts';
import { button, confirmAction, el, notice } from './dom.ts';
import { formField, type Field } from './forms.ts';
import type { PageContext } from './pages.ts';
interface Window { weekday: number; startMinute: number; endMinute: number }
export function minutes(value: string, end = false): number {
  if (end && value === '24:00') return 1440;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Use a 24-hour time such as 09:00.');
  const [hours, minutes] = value.split(':').map(Number); return hours! * 60 + minutes!;
}
export function validateWindows(windows: Window[], consultationMinutes: number) {
  if (windows.length > 28) throw new Error('Use at most 28 weekly availability windows.');
  for (const [index, window] of windows.entries()) {
    if (window.weekday < 1 || window.weekday > 7 || window.startMinute < 0 || window.endMinute > 1440 || window.endMinute - window.startMinute < consultationMinutes)
      throw new Error('Each availability window must fit a consultation.');
    if (windows.some((other, otherIndex) => otherIndex < index && window.weekday === other.weekday && other.startMinute < window.endMinute && other.endMinute > window.startMinute)) throw new Error('Weekly availability windows must not overlap.');
  } return windows;
}
const clock = (value: unknown) => { const number = Number(value ?? 0); return `${String(Math.floor(number / 60)).padStart(2, '0')}:${String(number % 60).padStart(2, '0')}`; };
export function availabilityEditor(doctor: RecordData, id: string, context: PageContext) {
  const form = el('form', 'editor'), fields: Field[] = [
    { key: 'timezone', label: 'Scheduling timezone', required: true, default: 'Asia/Kolkata' },
    { key: 'consultationMinutes', label: 'Consultation length · minutes', type: 'number', required: true, min: 10, max: 120, default: 20 },
    { key: 'bufferMinutes', label: 'Time between consultations · minutes', type: 'number', required: true, min: 0, max: 60, default: 5 },
    { key: 'acceptingAppointments', label: 'Accepting appointments', type: 'checkbox' },
    { key: 'excludedDates', label: 'Unavailable dates · YYYY-MM-DD, one per line', type: 'lines', required: false },
  ];
  const exceptions = Array.isArray(doctor.exceptions) ? doctor.exceptions as RecordData[] : [];
  const values = { ...doctor, excludedDates: exceptions.map(exception => exception.localDate) };
  const inputs = fields.map(field => ({ field, ...formField(field, values[field.key as keyof typeof values]) }));
  const grid = el('div', 'form-grid'); inputs.forEach(input => grid.append(input.wrap));
  const list = el('div'), readers: (() => Window | null)[] = [];
  const addWindow = (value: RecordData = {}) => {
    const row = el('fieldset', 'availability-window'), weekday = formField({ key: 'weekday', label: 'Day', type: 'select', options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][Number(value.weekday ?? 1) - 1]);
    const start = formField({ key: 'start', label: 'From · 24-hour time', required: true }, value.startMinute === undefined ? '09:00' : clock(value.startMinute));
    const end = formField({ key: 'end', label: 'Until · 24-hour time', required: true, hint: '24:00 can be used for midnight.' }, value.endMinute === undefined ? '17:00' : clock(value.endMinute));
    let removed = false;
    row.append(el('legend', '', 'Availability window'), weekday.wrap, start.wrap, end.wrap, button('Remove window', () => { removed = true; row.remove(); }, 'button text-button'));
    readers.push(() => removed ? null : { weekday: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(String(weekday.read())) + 1, startMinute: minutes(String(start.read())), endMinute: minutes(String(end.read()), true) }); list.append(row);
  };
  for (const window of (Array.isArray(doctor.availability) ? doctor.availability : []) as RecordData[]) addWindow(window);
  const message = el('div'), submit = el('button', 'button primary', 'Save availability'); submit.type = 'submit';
  form.append(grid, el('h3', 'availability-title', 'Weekly windows'), list, button('Add weekly window', () => addWindow()), message, el('div', 'form-footer', el('p', 'muted', 'Existing bookings are preserved. New availability affects future scheduling.'), submit));
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (submit.disabled || !context.alive()) return; message.replaceChildren();
    try {
      const payload = Object.fromEntries(inputs.map(input => [input.field.key, input.read()]));
      try { new Intl.DateTimeFormat('en', { timeZone: String(payload.timezone) }); } catch { throw new Error('Enter a valid scheduling timezone.'); }
      for (const date of payload.excludedDates as string[]) { const parsed = new Date(`${date}T00:00:00Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Check unavailable dates; use real dates in YYYY-MM-DD format.'); }
      payload.windows = validateWindows(readers.map(read => read()).filter((value): value is Window => value !== null), Number(payload.consultationMinutes));
      if (!await confirmAction('Update doctor availability?', 'Replace weekly windows and unavailable dates for this doctor? Existing bookings remain unchanged.') || !context.alive()) return;
      submit.disabled = true; await context.api.request(`/admin/operations/doctors/${id}/availability`, 'POST', payload);
      if (context.alive()) message.append(notice('Availability saved.'));
    } catch (error) { if (context.alive() && !(error instanceof StaleRequest)) message.append(notice((error as Error).message, true)); }
    finally { submit.disabled = false; }
  }); return form;
}
