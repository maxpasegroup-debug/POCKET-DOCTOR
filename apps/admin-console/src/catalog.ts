import { badge, date, el, link, money } from './dom.ts';
export type RecordData = Record<string, unknown>;
export interface Column { key: string; label: string; kind?: 'status' | 'date' | 'money' | 'boolean' }
export interface Domain { id: string; title: string; group: string; description: string; columns: Column[]; search?: boolean; detail?: boolean; create?: boolean }
const c = (key: string, label: string, kind?: Column['kind']): Column => ({ key, label, kind });
export const domains: Domain[] = [
  { id: 'users', title: 'Users', group: 'People', description: 'Manage account access. Personal health records stay private.', search: true, detail: true, columns: [c('fullName', 'Name'), c('language', 'Language'), c('accountStatus', 'Account', 'status'), c('createdAt', 'Joined', 'date')] },
  { id: 'doctors', title: 'Doctors', group: 'People', description: 'Review professional details and verify your partner network.', search: true, detail: true, columns: [c('name', 'Doctor'), c('specialty', 'Specialty'), c('verificationStatus', 'Verification', 'status'), c('acceptingAppointments', 'Accepting visits', 'boolean')] },
  { id: 'programs', title: 'Programs', group: 'Care & learning', description: 'Manage doctor-led education, curriculum, pricing and publication.', search: true, detail: true, create: true, columns: [c('title', 'Program'), c('type', 'Format', 'status'), c('publicationStatus', 'Publication', 'status'), c('pricePaise', 'Price · INR', 'money')] },
  { id: 'categories', title: 'Categories', group: 'Care & learning', description: 'Organize programs around clear wellness interests.', create: true, columns: [c('name', 'Category'), c('interest', 'Wellness interest'), c('position', 'Display order')] },
  { id: 'appointments', title: 'Consultations', group: 'Care & learning', description: 'Review scheduling and operational status. Consultation notes are excluded.', detail: true, columns: [c('id', 'Reference'), c('startsAt', 'Appointment', 'date'), c('status', 'Status', 'status'), c('feePaise', 'Fee · INR', 'money')] },
  { id: 'products', title: 'Wellness products', group: 'Wellness commerce', description: 'Maintain curated products, reviewed information and inventory.', search: true, detail: true, create: true, columns: [c('name', 'Product'), c('sku', 'SKU'), c('status', 'Status', 'status'), c('pricePaise', 'Price · INR', 'money'), c('stockQuantity', 'Stock')] },
  { id: 'orders', title: 'Orders', group: 'Wellness commerce', description: 'Follow fulfilment from processing to delivery.', detail: true, columns: [c('id', 'Order reference'), c('status', 'Status', 'status'), c('totalPaise', 'Total · INR', 'money'), c('createdAt', 'Placed', 'date')] },
  { id: 'memberships', title: 'Memberships', group: 'Membership & revenue', description: 'Review membership terms and lifecycle without changing payment evidence.', columns: [c('id', 'Subscription'), c('pricePaise', 'Term price · INR', 'money'), c('status', 'Status', 'status'), c('periodEnd', 'Term ends', 'date')] },
  { id: 'plans', title: 'Plans & benefits', group: 'Membership & revenue', description: 'Publish clear membership terms and explicit benefit entitlements.', detail: true, create: true, columns: [c('name', 'Plan'), c('interval', 'Billing interval'), c('pricePaise', 'Price · INR', 'money'), c('active', 'Available', 'boolean'), c('isDemo', 'Demo', 'boolean')] },
  { id: 'coupons', title: 'Offers & coupons', group: 'Membership & revenue', description: 'Manage bounded offers for selected membership plans.', detail: true, create: true, columns: [c('code', 'Code'), c('type', 'Discount type'), c('value', 'Value'), c('endsAt', 'Ends', 'date'), c('active', 'Active', 'boolean')] },
  { id: 'payments', title: 'Payments & refunds', group: 'Membership & revenue', description: 'Review the payment ledger. Refund requests never imply money was returned.', detail: true, columns: [c('id', 'Payment reference'), c('provider', 'Provider'), c('amountPaise', 'Amount · INR', 'money'), c('status', 'Payment', 'status'), c('refundStatus', 'Refund', 'status')] },
  { id: 'ai', title: 'AI oversight', group: 'Trust & operations', description: 'Review aggregate safety events from the last 30 days. Conversations and memories remain private.', columns: [c('event', 'Event'), c('_count._all', 'Events · last 30 days')] },
  { id: 'whatsapp', title: 'WhatsApp', group: 'Trust & operations', description: 'Monitor message processing without opening personal message content.', columns: [c('id', 'Receipt'), c('status', 'Processing', 'status'), c('createdAt', 'Received', 'date')] },
  { id: 'notifications', title: 'Notifications', group: 'Trust & operations', description: 'Monitor delivery attempts and retry eligible failures.', columns: [c('kind', 'Type'), c('channel', 'Channel'), c('status', 'Delivery', 'status'), c('attempts', 'Attempts'), c('createdAt', 'Created', 'date')] },
  { id: 'privacy-requests', title: 'Privacy requests', group: 'Trust & operations', description: 'Track user requests and their review status. Fulfilment follows approved retention policy.', columns: [c('id', 'Request'), c('type', 'Request type'), c('status', 'Status', 'status'), c('createdAt', 'Requested', 'date')] },
  { id: 'audit', title: 'Audit trail', group: 'Trust & operations', description: 'Trace administrative actions without exposing sensitive record contents.', columns: [c('action', 'Action'), c('resourceId', 'Resource reference'), c('result', 'Outcome', 'status'), c('createdAt', 'Recorded', 'date')] },
];
export function valueAt(item: RecordData, path: string): unknown {
  let value: unknown = item;
  for (const key of path.split('.')) { if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined; value = (value as RecordData)[key]; }
  return value;
}
export function displayValue(item: RecordData, column: Column): string {
  const value = valueAt(item, column.key);
  if (column.kind === 'date') return date(value);
  if (column.kind === 'money') return money(value, typeof item.currency === 'string' ? item.currency : 'INR');
  if (column.kind === 'boolean') return value === true ? 'Yes' : value === false ? 'No' : '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value) && value.every(v => typeof v === 'string')) return value.join(', ');
  return '—';
}
export function table(items: RecordData[], columns: Column[], detailDomain?: string, action?: (item: RecordData) => HTMLElement | undefined) {
  const table = el('table', 'data-table'), header = el('tr');
  for (const column of columns) { const th = el('th', '', column.label); th.scope = 'col'; header.append(th); }
  if (detailDomain || action) { const th = el('th', '', 'Action'); th.scope = 'col'; header.append(th); }
  table.append(el('thead', '', header)); const body = el('tbody');
  for (const item of items) {
    const row = el('tr');
    for (const column of columns) row.append(el('td', column.key === 'id' ? 'reference' : '', column.kind === 'status' ? badge(valueAt(item, column.key)) : displayValue(item, column)));
    if (detailDomain || action) row.append(el('td', '', detailDomain && typeof item.id === 'string' ? link('Open →', `/${detailDomain}/${encodeURIComponent(item.id)}`, 'row-link') : action?.(item)));
    body.append(row);
  }
  table.append(body); const wrap = el('div', 'table-scroll', table); wrap.tabIndex = 0; wrap.setAttribute('aria-label', 'Records table; scroll horizontally for more columns'); return wrap;
}
export function routeFromHash(hash: string): { domain: string; id?: string } {
  const parts = hash.replace(/^#\/?/, '').split('/'); const domain = parts[0] || 'dashboard';
  const valid = ['dashboard', 'settings', 'revenue', ...domains.map(d => d.id)];
  if (!valid.includes(domain) || parts.length > 2) return { domain: 'not-found' };
  const id = parts[1];
  if (id && id !== 'new' && !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return { domain: 'not-found' };
  if (id && !domains.find(d => d.id === domain && (id === 'new' ? d.create : d.detail))) return { domain: 'not-found' };
  return { domain, ...(id ? { id } : {}) };
}
export function refundActionState(payment: RecordData, readiness: { name: string; status: string }[]) {
  const configured = readiness.some(service => service.name === 'Refund processing' && ['CONFIGURED', 'READY'].includes(service.status));
  const eligible = configured && payment.provider === 'razorpay' && payment.status === 'VERIFIED';
  return { configured, process: eligible && payment.refundStatus === 'REFUND_REQUESTED', reconcile: eligible && ['REFUND_PROCESSING', 'REFUND_FAILED'].includes(String(payment.refundStatus)) };
}
