import { button, confirmAction, el, notice } from './dom.ts';
import type { RecordData } from './catalog.ts';
import { StaleRequest } from './api.ts';
export interface Field {
  key: string; label: string; type?: 'text' | 'textarea' | 'number' | 'checkbox' | 'select' | 'lines' | 'datetime-local' | 'url';
  options?: string[]; required?: boolean; nullable?: boolean; min?: number; max?: number; hint?: string; default?: unknown;
  lookup?: { search: boolean; load: (query: string, page: number) => Promise<{ items: { id: string; label: string }[]; hasMore: boolean }>; alive: () => boolean };
}
const f = (key: string, label: string, type: Field['type'] = 'text', extra: Partial<Field> = {}): Field => ({ key, label, type, required: true, ...extra });
export const doctorFields: Field[] = [f('name', 'Professional name'), f('qualification', 'Verified qualification'), f('specialty', 'Specialty'),
  f('biography', 'Professional description', 'textarea'), f('languages', 'Languages · one per line', 'lines'),
  f('experienceYears', 'Years of experience', 'number', { nullable: true, required: false, min: 0, max: 80 }),
  f('feePaise', 'Consultation fee · paise (100 = ₹1)', 'number', { min: 0 }),
  f('verificationStatus', 'Verification status', 'select', { options: ['PENDING_VERIFICATION', 'VERIFIED', 'SUSPENDED', 'INACTIVE', 'REJECTED'] }),
  f('registrationAuthority', 'Registration authority', 'text', { nullable: true, required: false }),
  f('registrationNumber', 'Registration number', 'text', { nullable: true, required: false }),
  f('acceptingAppointments', 'Accepting appointments', 'checkbox')];
export const programFields: Field[] = [f('title', 'Program title'), f('description', 'Description', 'textarea'), f('audience', 'Who this program is for', 'textarea'),
  f('outcomes', 'Learning outcomes · one per line', 'lines'), f('categoryId', 'Category ID', 'text', { hint: 'Use a category from the categories workspace.' }),
  f('doctorId', 'Leading doctor ID', 'text', { hint: 'Use a verified professional. Demo profiles are for demo programs only.' }),
  f('type', 'Format', 'select', { options: ['RECORDED', 'LIVE'] }), f('durationMinutes', 'Duration · minutes', 'number', { min: 1 }),
  f('pricePaise', 'Price · paise (0 is free)', 'number', { min: 0 }), f('level', 'Level', 'text', { default: 'Beginner', hint: 'For example Beginner or All levels.' }),
  f('membershipOnly', 'Members only', 'checkbox'), f('featured', 'Featured program', 'checkbox'),
  f('publicationStatus', 'Publication status', 'select', { options: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], hint: 'Publish only after professional content review.' }),
  f('coverUrl', 'Cover image · HTTPS URL', 'url', { nullable: true, required: false })];
export const productFields: Field[] = [f('name', 'Product name'), f('slug', 'URL name'), f('sku', 'SKU'), f('categoryId', 'Wellness category ID'),
  f('shortDescription', 'Short description', 'textarea'), f('description', 'Full product information', 'textarea'),
  f('images', 'Image URLs · one HTTPS URL per line', 'lines', { required: false }), f('pricePaise', 'Price · paise', 'number', { min: 1 }),
  f('mrpPaise', 'MRP · paise', 'number', { required: false, nullable: true, min: 1 }),
  f('status', 'Catalogue status', 'select', { options: ['DRAFT', 'ACTIVE', 'OUT_OF_STOCK', 'INACTIVE', 'ARCHIVED'] }),
  f('brand', 'Brand'), f('manufacturer', 'Manufacturer', 'textarea'), f('ingredients', 'Ingredients', 'textarea'),
  f('usage', 'Usage information', 'textarea'), f('warnings', 'Warnings', 'textarea'), f('storage', 'Storage', 'textarea'),
  f('quantityLabel', 'Pack size'), f('returnPolicy', 'Return policy', 'textarea'), f('collection', 'Collection', 'text', { required: false }),
  f('doctorId', 'Associated doctor ID · optional', 'text', { nullable: true, required: false }),
  ...['shippingEligible', 'requiresEligibility', 'contentApproved', 'membershipOnly', 'featured', 'isDemo'].map(key => f(key, ({ shippingEligible: 'Eligible for shipping', requiresEligibility: 'Requires eligibility review', contentApproved: 'Product content reviewed and approved', membershipOnly: 'Members only', featured: 'Featured product', isDemo: 'Demo product' } as Record<string, string>)[key]!, 'checkbox'))];
export const planFields: Field[] = [f('name', 'Plan name'), f('slug', 'URL name'), f('description', 'Description', 'textarea'), f('pricePaise', 'Price · paise', 'number', { min: 100 }),
  f('interval', 'Billing interval', 'select', { options: ['MONTH', 'YEAR'] }), f('trialDays', 'Trial days', 'number', { min: 0, max: 30, default: 0 }),
  f('graceDays', 'Grace days', 'number', { min: 0, max: 14, default: 0 }), f('position', 'Display order', 'number', { min: 0, max: 100, default: 0 }),
  f('active', 'Available to customers', 'checkbox'), f('isDemo', 'Demo plan', 'checkbox', { default: true })];
export const couponFields: Field[] = [f('code', 'Coupon code'), f('type', 'Discount type', 'select', { options: ['PERCENT', 'FIXED'] }), f('value', 'Value · percent or fixed paise', 'number', { min: 1 }),
  f('startsAt', 'Starts · your local time', 'datetime-local'), f('endsAt', 'Ends · your local time', 'datetime-local'),
  f('usageLimit', 'Total redemption limit', 'number', { min: 1, max: 100000 }), f('perUserLimit', 'Per-user limit', 'number', { min: 1, max: 100, default: 1 }),
  f('planIds', 'Eligible plan IDs · one per line', 'lines'), f('active', 'Offer active', 'checkbox'), f('introductory', 'First-term offer only', 'checkbox')];
export const categoryFields = [f('id', 'Category ID', 'text', { hint: 'Stable lowercase identifier, for example sleep.' }), f('name', 'Category name'), f('interest', 'Matching wellness interest', 'text', { nullable: true, required: false }), f('position', 'Display order', 'number', { min: 0, default: 0 })];
export const moduleFields = [f('title', 'Module title'), f('position', 'Display order', 'number', { min: 0 })];
export const lessonFields = [f('title', 'Lesson title'), f('description', 'Description', 'textarea'), f('position', 'Display order', 'number', { min: 0 }),
  f('durationSeconds', 'Duration · seconds', 'number', { min: 1 }), f('required', 'Required for completion', 'checkbox', { default: true }),
  f('mediaRef', 'Secure media reference', 'text', { nullable: true, required: false, hint: 'Use a provider reference. Do not paste credentials or private signed URLs.' }),
  f('keyPoints', 'Key points · one per line', 'lines', { required: false }), f('supportingMaterial', 'Supporting material', 'textarea', { required: false })];
export const liveFields = [f('title', 'Session title'), f('startsAt', 'Starts · your local time', 'datetime-local'), f('durationMinutes', 'Duration · minutes', 'number', { min: 1 }), f('information', 'Session information', 'textarea')];
export function parseField(field: Field, raw: string | boolean): unknown {
  if (field.type === 'checkbox') return raw === true;
  const value = String(raw).trim();
  if (field.required && !value) throw new Error(`${field.label} is required.`);
  if (!value && field.nullable) return null;
  if (field.type === 'number') {
    if (!value) throw new Error(`${field.label} needs a number.`);
    const number = Number(value);
    if (!Number.isSafeInteger(number) || (field.min !== undefined && number < field.min) || (field.max !== undefined && number > field.max)) throw new Error(`Check ${field.label.toLowerCase()}.`);
    return number;
  }
  if (field.type === 'select' && !field.options?.includes(value)) throw new Error(`Choose ${field.label.toLowerCase()}.`);
  if (field.type === 'lines') return value.split('\n').map(v => v.trim()).filter(Boolean);
  if (field.type === 'datetime-local') { const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) throw new Error(`Check ${field.label.toLowerCase()}.`); return parsed.toISOString(); }
  if (field.type === 'url' && value) { let url: URL; try { url = new URL(value); } catch { throw new Error('Enter a valid HTTPS image URL.'); } if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Enter a valid HTTPS image URL.'); }
  return value;
}
function localDate(value: unknown) { if (!value) return ''; const date = new Date(String(value)); if (Number.isNaN(date.getTime())) return ''; const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
export function formField(field: Field, value: unknown) {
  if (field.lookup) return referenceField(field, value);
  const id = `field-${field.key}-${++fieldCounter}`;
  let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (field.type === 'select') {
    input = el('select'); for (const option of field.options ?? []) { const node = el('option', '', option.replace(/_/g, ' ')); node.value = option; input.append(node); }
  } else if (field.type === 'textarea' || field.type === 'lines') { input = el('textarea'); input.rows = field.type === 'lines' ? 3 : 4; }
  else { input = el('input'); input.type = field.type ?? 'text'; }
  input.id = id; input.name = field.key; input.required = field.required !== false && field.type !== 'checkbox';
  if (input instanceof HTMLInputElement && field.type === 'checkbox') input.checked = (value ?? field.default) === true;
  else input.value = field.type === 'datetime-local' ? localDate(value) : Array.isArray(value) ? value.join('\n') : String(value ?? field.default ?? (field.type === 'select' ? field.options?.[0] ?? '' : ''));
  if (input instanceof HTMLInputElement && field.type === 'number') { input.step = '1'; if (field.min !== undefined) input.min = String(field.min); if (field.max !== undefined) input.max = String(field.max); }
  const label = el('label', '', field.label); label.htmlFor = id;
  const wrap = field.type === 'checkbox' ? el('div', 'field check-field', input, label) : el('div', field.type === 'textarea' || field.type === 'lines' ? 'field wide' : 'field', label, input);
  if (field.hint) { const hint = el('small', '', field.hint); hint.id = id + '-hint'; input.setAttribute('aria-describedby', hint.id); wrap.append(hint); }
  return { wrap, read: () => parseField(field, input instanceof HTMLInputElement && field.type === 'checkbox' ? input.checked : input.value) };
}
let fieldCounter = 0;
function referenceField(field: Field, value: unknown) {
  const id = `reference-${field.key}-${++fieldCounter}`, select = el('select'), label = el('label', '', field.label), message = el('div'), picker = el('div', 'reference-picker');
  label.htmlFor = id; select.id = id; select.required = field.required !== false; select.name = field.key;
  const options = new Map<string, string>(); if (typeof value === 'string' && value) options.set(value, 'Current saved selection');
  const emptyOption = el('option', '', 'Choose an option'); emptyOption.value = ''; select.append(emptyOption);
  for (const [id, name] of options) { const option = el('option', '', name); option.value = id; select.append(option); } select.value = String(value ?? '');
  let page = 1, query = '', version = 0;
  const more = button('Load more choices', async () => { page++; await fetchChoices(false); }, 'button text-button'); more.hidden = true;
  const fetchChoices = async (reset: boolean) => {
    const current = ++version; more.disabled = true; message.replaceChildren(notice('Loading choices…'));
    try {
      const result = await field.lookup!.load(query, page); if (current !== version || !field.lookup!.alive()) return;
      const selected = select.value;
      if (reset) { const selectedLabel = options.get(selected); options.clear(); if (selected) options.set(selected, selectedLabel ?? 'Current selection'); }
      for (const item of result.items) options.set(item.id, item.label);
      select.replaceChildren(emptyOption);
      for (const [id, name] of options) { const option = el('option', '', name); option.value = id; select.append(option); } select.value = selected;
      more.hidden = !result.hasMore; message.replaceChildren();
      if (!result.items.length) message.append(el('small', '', 'No matching choices. Change your search.'));
    } catch (error) { if (!(error instanceof StaleRequest) && current === version && field.lookup!.alive()) message.replaceChildren(notice((error as Error).message, true), button('Retry choices', () => fetchChoices(reset))); }
    finally { more.disabled = false; }
  };
  const wrap = el('div', 'field', label, select);
  if (field.lookup!.search) {
    const search = el('input'); search.type = 'search'; search.placeholder = `Find ${field.label.toLowerCase()}…`; search.setAttribute('aria-label', `Find ${field.label.toLowerCase()}`); search.maxLength = 100;
    const run = () => { query = search.value.trim(); page = 1; return fetchChoices(true); };
    search.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); void run(); } });
    picker.append(search, button('Find', run)); wrap.append(picker);
  }
  wrap.append(message, more); void fetchChoices(true);
  return { wrap, read: () => { if (select.required && !select.value) throw new Error(`Choose ${field.label.toLowerCase()}.`); return select.value || (field.nullable ? null : ''); } };
}
const benefitKeys = ['PROGRAM_ACCESS', 'MEMBER_PROGRAMS', 'CONSULTATION_DISCOUNT', 'WELLNESS_MEMBER_PRICING', 'MEMBER_PRODUCTS', 'AI_WELLNESS_FEATURES', 'PERSONAL_TRACKING', 'MEMBER_OFFERS'];
function benefitEditor(existing: unknown) {
  const wrap = el('fieldset', 'benefits-editor', el('legend', '', 'Plan benefits'), el('p', 'muted', 'Resource-based benefits require explicit IDs. An empty list does not unlock all content.'));
  const rows = el('div'), readers: (() => RecordData)[] = [];
  const add = (data: RecordData = {}) => {
    const row = el('fieldset', 'benefit-row', el('legend', '', `Benefit ${readers.length + 1}`));
    const fields = [f('key', 'Benefit type', 'select', { options: benefitKeys }), f('label', 'Customer-facing label'), f('resourceIds', 'Eligible resource IDs · one per line', 'lines', { required: false }), f('value', 'Value · percentage or request allowance', 'number', { min: 0, max: 100, default: 0 })];
    const inputs = fields.map(field => ({ field, ...formField(field, data[field.key]) })); inputs.forEach(input => row.append(input.wrap));
    let removed = false; row.append(button('Remove benefit', () => { removed = true; row.remove(); }, 'button text-button')); rows.append(row);
    readers.push(() => removed ? { removed: true } : Object.fromEntries(inputs.map(input => [input.field.key, input.read()])));
  };
  if (Array.isArray(existing)) for (const benefit of existing) if (benefit && typeof benefit === 'object') add(benefit as RecordData);
  wrap.append(rows, button('Add benefit', () => add()));
  return { wrap, read: () => readers.map(read => read()).filter(row => !row.removed) };
}
export function editor(fields: Field[], values: RecordData, save: (payload: RecordData) => Promise<void>, options: { label?: string; confirm?: string; benefits?: boolean; alive: () => boolean } ) {
  const form = el('form', 'editor'), grid = el('div', 'form-grid'), message = el('div');
  const inputs = fields.map(field => ({ field, ...formField(field, values[field.key]) })); inputs.forEach(input => grid.append(input.wrap));
  const benefits = options.benefits ? benefitEditor(values.benefits) : undefined;
  const submit = el('button', 'button primary', options.label ?? 'Save changes'); submit.type = 'submit';
  form.append(grid); if (benefits) form.append(benefits.wrap); form.append(message, el('div', 'form-footer', el('p', 'muted', 'Changes are validated and recorded by the server.'), submit));
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (submit.disabled || !options.alive()) return; submit.disabled = true;
    message.replaceChildren();
    try {
      const payload = Object.fromEntries(inputs.map(input => [input.field.key, input.read()])); if (benefits) payload.benefits = benefits.read();
      if (options.confirm && !await confirmAction('Confirm this change', options.confirm)) return;
      if (!options.alive()) return;
      submit.textContent = 'Saving…'; await save(payload);
      if (options.alive()) message.replaceChildren(notice('Changes saved.'));
    } catch (error) { if (!(error instanceof StaleRequest) && options.alive()) message.replaceChildren(notice(error instanceof Error ? error.message : 'Unable to save. Try again.', true)); }
    finally { submit.disabled = false; submit.textContent = options.label ?? 'Save changes'; }
  }); return form;
}
