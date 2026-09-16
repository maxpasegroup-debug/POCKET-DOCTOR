import { registrationReview } from './registration.ts';
import { ApiClient, StaleRequest } from './api.ts';
import { domains, table, displayValue, refundActionState, type Column, type Domain, type RecordData } from './catalog.ts';
import { badge, button, confirmAction, el, empty, failure, human, link, loading, money, notice } from './dom.ts';
import { categoryFields, couponFields, doctorFields, editor, lessonFields, liveFields, moduleFields, planFields, productFields, programFields, type Field } from './forms.ts';
export interface PageContext { api: ApiClient; alive: () => boolean; reload: () => void }
interface ListResult { items: RecordData[]; page: number; hasMore: boolean }
interface Readiness { name: string; status: string }
interface Settings { environment: string; readiness: Readiness[]; policies: { type: string; version: string; url: string; approved: boolean }[] }
export function heading(title: string, description: string) { return el('header', 'page-heading', el('p', 'eyebrow', 'POCKET DOCTOR / OPERATIONS'), el('h1', '', title), el('p', '', description)); }
async function load<T>(target: HTMLElement, context: PageContext, request: () => Promise<T>, render: (data: T) => void) {
  target.replaceChildren(loading());
  try { const data = await request(); if (context.alive()) { target.replaceChildren(); render(data); } }
  catch (error) { if (context.alive() && !(error instanceof StaleRequest)) target.replaceChildren(failure(error, () => { void load(target, context, request, render); })); }
}
export function readiness(items: Readiness[]) {
  const list = el('ul', 'readiness-list');
  for (const item of items) list.append(el('li', '', el('span', '', item.name), badge(item.status)));
  return list;
}
export function dashboard(context: PageContext) {
  const page = el('div', '', heading('A clear view of today.', 'Keep your people, content and operations moving with confidence.')), body = el('div'); page.append(body);
  void load(body, context, () => context.api.request<{ metrics: { label: string; value: number }[]; pending: { label: string; value: number }[]; environment: string; readiness: Readiness[] }>('/admin/operations/dashboard'), data => {
    const summary = el('section', 'metrics'); summary.setAttribute('aria-label', 'Platform totals');
    for (const metric of data.metrics) summary.append(el('div', 'metric', el('p', '', metric.label), el('strong', '', metric.value.toLocaleString('en-IN'))));
    const worklist = el('section', 'worklist', el('div', 'section-heading', el('div', '', el('p', 'eyebrow', 'YOUR NEXT ACTIONS'), el('h2', '', 'Needs attention')), el('span', 'count-label', `${data.pending.length} queues`)));
    const destinations: Record<string, string> = { doctor: 'doctors', program: 'programs', product: 'products', order: 'orders', payment: 'payments', refund: 'payments', privacy: 'privacy-requests', notification: 'notifications', consultation: 'appointments' };
    if (!data.pending.length) worklist.append(empty('No pending actions', 'Your operational queues are clear.'));
    for (const [index, item] of data.pending.entries()) {
      const target = Object.entries(destinations).find(([key]) => item.label.toLowerCase().includes(key))?.[1];
      worklist.append(el('div', 'work-row', el('span', 'work-index', String(index + 1).padStart(2, '0')), el('div', 'work-copy', el('h3', '', item.label), el('p', '', item.value === 0 ? 'Up to date' : `${item.value} awaiting review`)), el('strong', 'work-value', item.value), target ? link('Review →', '/' + target, 'row-link') : null));
    }
    const side = el('aside', 'readiness-panel', el('p', 'eyebrow', 'ENVIRONMENT & SERVICES'), el('h2', '', 'Platform readiness'), el('p', 'environment-name', data.environment), readiness(data.readiness), link('View configuration →', '/settings', 'row-link'), el('p', 'fine-print', 'Provider readiness is technical configuration, not legal approval or a launch decision.'));
    body.append(summary, el('div', 'dashboard-grid', worklist, side), el('section', 'desk-note', el('strong', '', 'A workspace built around trust.'), el('p', '', 'Administrative views contain operational information only. Personal health notes and private conversations stay outside this workspace.')));
  }); return page;
}
export function listPage(domain: Domain, context: PageContext) {
  const page = el('div', '', heading(domain.title, domain.description)), toolbar = el('div', 'toolbar'), body = el('div'); let pageNumber = 1, query = '', version = 0, pendingOnly = false;
  if (domain.search) {
    const form = el('form', 'search-form'), input = el('input'); input.type = 'search'; input.placeholder = `Search ${domain.title.toLowerCase()}…`; input.setAttribute('aria-label', `Search ${domain.title.toLowerCase()}`); input.maxLength = 100;
    const submit = el('button', 'button secondary', 'Search'); submit.type = 'submit';
    form.append(input, submit, button('Clear', () => { input.value = ''; query = ''; pageNumber = 1; fetchPage(); }, 'button text-button'));
    form.addEventListener('submit', event => { event.preventDefault(); query = input.value.trim(); pageNumber = 1; fetchPage(); }); toolbar.append(form);
  } else toolbar.append(el('p', 'muted', 'Operational records · server-ordered results'));
  if (domain.create) toolbar.append(link(domain.id === 'categories' ? 'Add category' : `Create ${domain.id === 'plans' ? 'plan' : domain.id.slice(0, -1)}`, `/${domain.id}/new`, 'button primary'));
  if (domain.id === 'doctors') toolbar.append(button('Toggle pending applications', () => { pendingOnly = !pendingOnly; pageNumber = 1; fetchPage(); }));
  page.append(toolbar, body);
  function fetchPage() {
    const current = ++version; const scoped = { ...context, alive: () => context.alive() && current === version };
    const queryString = new URLSearchParams({ ...(pendingOnly ? {pending:'true'} : {}), page: String(pageNumber), ...(query ? { q: query } : {}) });
    void load(body, scoped, () => context.api.request<ListResult>(`/admin/operations/${domain.id}?${queryString}`), result => {
      if (!result.items.length) body.append(empty(query ? 'No matching records' : 'No records yet', query ? 'Try another search or clear your search.' : 'Records will appear here as activity begins.'));
      else body.append(table(result.items, domain.columns, domain.detail ? domain.id : undefined, domain.id === 'payments' ? item => paymentAction(item, scoped) : domain.id === 'notifications' ? item => notificationAction(item, scoped) : undefined));
      const previous = button('← Previous', () => { pageNumber--; fetchPage(); }); previous.disabled = pageNumber <= 1;
      const next = button('Next →', () => { pageNumber++; fetchPage(); }); next.disabled = !result.hasMore;
      body.append(el('nav', 'pagination', previous, el('span', '', `Page ${result.page}`), next));
    });
  }
  fetchPage(); return page;
}
function mutationButton(label: string, prompt: string, context: PageContext, path: string, body: RecordData = {}) {
  const wrap = el('div', 'inline-action'), message = el('div');
  const action = button(label, async () => {
    if (!context.alive() || action.disabled) return;
    action.disabled = true;
    try {
      if (!await confirmAction(label, prompt) || !context.alive()) return;
      await context.api.request(path, 'POST', body); if (context.alive()) { message.replaceChildren(notice('Request recorded.')); context.reload(); }
    }
    catch (error) { if (context.alive() && !(error instanceof StaleRequest)) message.replaceChildren(notice((error as Error).message, true)); }
    finally { action.disabled = false; }
  }); wrap.append(action, message); return wrap;
}
function paymentAction(item: RecordData, context: PageContext) {
  if (item.status !== 'VERIFIED' || item.refundStatus !== 'NOT_REQUESTED') return undefined;
  return mutationButton('Request refund', 'Request a refund review for this payment? This does not mark money as returned.', context, `/admin/operations/payments/${encodeURIComponent(String(item.id))}/refund`, { confirm: true });
}
function notificationAction(item: RecordData, context: PageContext) {
  if (!['FAILED', 'RETRYABLE', 'DEAD_LETTER'].includes(String(item.status))) return undefined;
  return mutationButton('Retry delivery', 'Retry this notification through its configured provider?', context, `/admin/operations/notifications/${encodeURIComponent(String(item.id))}/retry`, { confirm: true });
}
function section(title: string, content: HTMLElement, description?: string) { return el('section', 'detail-section', el('h2', '', title), description ? el('p', 'muted', description) : null, content); }
function facts(item: RecordData, columns: Column[]) {
  const dl = el('dl', 'facts'); for (const column of columns) dl.append(el('div', '', el('dt', '', column.label), el('dd', '', column.kind === 'status' ? badge(item[column.key]) : displayValue(item, column)))); return dl;
}
export function detailPage(domain: Domain, id: string, context: PageContext) {
  const creating = id === 'new', page = el('div', '', link(`← ${domain.title}`, `/${domain.id}`, 'back-link'), heading(creating ? `Create ${domain.id === 'categories' ? 'category' : domain.id === 'plans' ? 'plan' : domain.id.slice(0, -1)}` : domain.title, domain.description)), body = el('div'); page.append(body);
  const render = (item: RecordData) => {
    if (!creating) body.append(facts(item, [{ key: 'id', label: 'Reference' }, ...domain.columns, ...(domain.id === 'users' ? [{ key: 'phone', label: 'Mobile number' }] : [])]));
    const requestSave = (path: string, method: string, transform: (payload: RecordData) => RecordData = p => p) => async (payload: RecordData) => {
      const result = await context.api.request<{ item?: RecordData }>(path, method, transform(payload));
      if (creating && context.alive()) location.hash = domain.detail && typeof result.item?.id === 'string' ? `/${domain.id}/${encodeURIComponent(result.item.id)}` : `/${domain.id}`;
    };
    const options = { alive: context.alive, label: creating ? 'Create draft' : 'Save changes', confirm: 'Save these operational changes? Access, availability or published information may change.' };
    if (domain.id === 'users') {
      body.append(section('Account access', editor([{ key: 'status', label: 'Account status', type: 'select', options: ['ACTIVE', 'DEACTIVATED', 'SUSPENDED'], required: true }, { key: 'reason', label: 'Reason for change', type: 'select', options: ['SUPPORT_REQUEST', 'SECURITY_REVIEW', 'POLICY_REVIEW'], required: true }], { ...item, status: item.accountStatus }, requestSave(`/admin/operations/users/${id}/status`, 'POST'), options), 'Deactivation or suspension prevents account access. It does not delete the user’s records.'));
      const counts = item._count ?? item.counts;
      if (counts && typeof counts === 'object') body.append(section('Activity totals', facts(counts as RecordData, ['enrollments', 'consultations', 'orders', 'subscriptions'].map(key => ({ key, label: human(key.replace(/([a-z])([A-Z])/g, '$1 $2')) })))));
      body.append(userActivity(id, context));
    }
    if (domain.id === 'doctors' && item.registrationStartedAt) body.append(registrationReview(id, context));
    if (domain.id === 'doctors') {
      body.append(section('Doctor details', facts(item, doctorFields.map(field => ({
        key: field.key, label: field.key === 'qualification' ? 'Qualification' : field.key === 'languages' ? 'Languages' : field.key === 'feePaise' ? 'Consultation fee' : field.label,
        kind: field.key === 'feePaise' ? 'money' : field.type === 'checkbox' ? 'boolean' : field.key === 'verificationStatus' ? 'status' : undefined,
      }))), 'Read-only. The doctor supplies these details. Request corrections through application review when needed.'));
      const schedule = el('div', '', facts(item, [{ key: 'timezone', label: 'Timezone' }, { key: 'consultationMinutes', label: 'Consultation length (minutes)' }, { key: 'bufferMinutes', label: 'Buffer (minutes)' }]));
      const windows = Array.isArray(item.availability) ? item.availability as RecordData[] : [];
      const clock = (value: unknown) => `${String(Math.floor(Number(value) / 60)).padStart(2, '0')}:${String(Number(value) % 60).padStart(2, '0')}`;
      schedule.append(windows.length ? table(windows.map(window => ({ ...window,
        day: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][Number(window.weekday) - 1],
        start: clock(window.startMinute), end: clock(window.endMinute),
      })), [{ key: 'day', label: 'Day' }, { key: 'start', label: 'From' }, { key: 'end', label: 'Until' }]) : el('p', '', 'No weekly availability set.'));
      const exceptions = Array.isArray(item.exceptions) ? item.exceptions as RecordData[] : [];
      schedule.append(el('p', '', `Unavailable dates: ${exceptions.map(exception => String(exception.localDate)).join(', ') || 'None'}`));
      body.append(section('Appointment availability', schedule, 'Read-only. The doctor manages their schedule.'));
    }
    if (domain.id === 'programs') {
      const referenceFields = programFields.map(field => ['doctorId', 'categoryId'].includes(field.key) ? {
        ...field, label: field.key === 'doctorId' ? 'Leading doctor' : 'Program category', lookup: {
          search: field.key === 'doctorId', alive: context.alive,
          load: async (query: string, page: number) => {
            const target = field.key === 'doctorId' ? 'doctors' : 'categories';
            const result = await context.api.request<ListResult>(`/admin/operations/${target}?page=${page}${query ? `&q=${encodeURIComponent(query)}` : ''}`);
            return { items: result.items.map(item => ({ id: String(item.id), label: `${item.name}${item.isDemo ? ' · DEMO' : ''}${target === 'doctors' ? ` · ${human(String(item.verificationStatus))}` : ''}` })), hasMore: result.hasMore };
          },
        },
      } : field);
      const fields = creating ? [...referenceFields.filter(f => f.key !== 'publicationStatus'), { key: 'isDemo', label: 'Demo program', type: 'checkbox' as const, default: true }] : referenceFields;
      body.append(section('Program information', editor(fields, item, requestSave(creating ? '/admin/operations/programs' : `/admin/operations/programs/${id}`, creating ? 'POST' : 'PATCH', p => creating ? { ...p, publicationStatus: 'DRAFT' } : p), options)));
      if (!creating) body.append(curriculum(item, id, context));
    }
    if (domain.id === 'categories') body.append(section('Category details', editor(categoryFields, item, requestSave('/admin/operations/categories', 'POST'), { ...options, label: 'Create category' })));
    if (domain.id === 'products') {
      body.append(section('Product content & availability', editor(productFields, item, requestSave(creating ? '/admin/wellness/products' : `/admin/wellness/products/${id}`, creating ? 'POST' : 'PATCH'), options), 'Active products require reviewed content and eligibility checks. Prices are stored in paise.'));
      if (!creating) body.append(section('Inventory adjustment', editor([{ key: 'delta', label: 'Stock adjustment · positive to add, negative to remove', type: 'number', required: true }], {}, requestSave(`/admin/wellness/products/${id}/inventory`, 'POST'), { ...options, label: 'Adjust inventory' })));
    }
    if (domain.id === 'orders') {
      body.append(section('Fulfilment', editor([{ key: 'status', label: 'Next fulfilment status', type: 'select', options: ['PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'], required: true }, { key: 'carrier', label: 'Carrier', required: false }, { key: 'trackingNumber', label: 'Tracking number', required: false }], item,
        requestSave(`/admin/wellness/orders/${id}/status`, 'POST', p => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== ''))), options)));
      body.append(section('Order cancellation', mutationButton('Cancel order', 'Cancel this order according to its current fulfilment policy? Any refund is handled separately.', context, `/admin/operations/orders/${id}/cancel`)));
      if (Array.isArray(item.items)) body.append(section('Order items', table(item.items as RecordData[], [{ key: 'name', label: 'Product' }, { key: 'quantity', label: 'Quantity' }, { key: 'unitPricePaise', label: 'Unit price · INR', kind: 'money' }])));
    }
    if (domain.id === 'appointments') body.append(section('Consultation controls', mutationButton('Cancel consultation', 'Cancel this consultation according to its appointment policy? Clinical notes are not opened or modified.', context, `/admin/operations/appointments/${id}/cancel`)));
    if (domain.id === 'payments') {
      const invoice = item.invoice && typeof item.invoice === 'object' ? item.invoice as RecordData : undefined;
      body.append(section('Payment receipt', invoice ? el('div', '', facts(invoice, [
        { key: 'number', label: 'Receipt number' }, { key: 'status', label: 'Receipt type', kind: 'status' },
        { key: 'amountPaise', label: 'Amount', kind: 'money' }, { key: 'currency', label: 'Currency' },
        { key: 'issuedAt', label: 'Issued', kind: 'date' }, { key: 'taxPaise', label: 'Recorded tax', kind: 'money' },
      ]), el('p', 'fine-print', invoice.taxPaise === null ? 'Tax information has not been recorded. This payment receipt is not a tax invoice.' : 'Tax treatment and invoice approval are separate accounting controls.')) : empty('No receipt available', 'A receipt is issued only after a verified payment.')));
      const request = paymentAction(item, context); if (request) body.append(section('Refund review', request, 'Record a review request first. A request does not return funds.'));
      const provider = el('div'); body.append(section('Provider refund controls', provider, 'Processing may return the full payment through the configured provider. Cancel the purchase first when its policy requires it.'));
      void load(provider, context, () => context.api.request<Settings>('/admin/operations/settings'), settings => {
        const state = refundActionState(item, settings.readiness);
        if (!state.configured) provider.append(notice('Refund provider configuration is pending. Processing and reconciliation are unavailable.'));
        else if (item.provider !== 'razorpay') provider.append(notice('This payment does not belong to the configured Razorpay provider. Development payments cannot trigger a real refund.'));
        const controls = el('div', 'actions');
        if (state.process) controls.append(mutationButton('Process full refund', `Send a refund request for ${money(item.amountPaise, String(item.currency ?? 'INR'))} to the configured provider? This can return funds. The server verifies eligibility and records the provider response.`, context, `/admin/refunds/${id}/process`, { confirm: true }));
        else { const process = button('Process full refund', () => {}); process.disabled = true; controls.append(process); }
        if (state.reconcile) controls.append(mutationButton('Reconcile refund', 'Fetch and verify this refund’s status from the provider? This checks an existing request and does not send a second refund.', context, `/admin/refunds/${id}/reconcile`, { confirm: true }));
        else { const reconcile = button('Reconcile refund', () => {}); reconcile.disabled = true; controls.append(reconcile); }
        provider.append(controls, el('p', 'fine-print', 'If processing times out, check the recorded refund state before taking another action. Never submit a second refund to resolve an uncertain response.'));
      });
    }
    if (domain.id === 'plans') body.append(section('Membership terms', editor(planFields, item, requestSave(creating ? '/admin/membership/plans' : `/admin/membership/plans/${id}`, creating ? 'POST' : 'PATCH', p => ({ ...p, currency: 'INR' })), { ...options, benefits: true }), 'Existing paid terms retain their saved pricing and benefits. Update future offers deliberately.'));
    if (domain.id === 'coupons') body.append(section('Offer details', editor(creating ? couponFields : [{ key: 'active', label: 'Offer active', type: 'checkbox' }], item, requestSave(creating ? '/admin/membership/coupons' : `/admin/membership/coupons/${id}`, creating ? 'POST' : 'PATCH'), { ...options, label: creating ? 'Create offer' : 'Save availability' }), creating ? 'Offers apply only to the selected membership plans.' : 'Published offer terms are preserved. You can enable or disable availability.'));
  };
  if (creating) render({}); else void load(body, context, () => context.api.request<{ item: RecordData }>(`/admin/operations/${domain.id}/${encodeURIComponent(id)}`), result => render(result.item));
  return page;
}
function curriculum(item: RecordData, id: string, context: PageContext) {
  const content = el('div'), modules = Array.isArray(item.modules) ? item.modules as RecordData[] : [];
  const form = (title: string, fields: Field[], value: RecordData, path: string, method = 'POST', extra: RecordData = {}) => {
    const details = el('details', 'curriculum-item', el('summary', '', title));
    details.append(editor(fields, value, async payload => { await context.api.request(path, method, { ...payload, ...extra }); if (context.alive()) context.reload(); }, { alive: context.alive, label: method === 'POST' ? 'Add to curriculum' : 'Save changes', confirm: 'Save this curriculum change? Existing enrollment and progress history will be preserved.' })); return details;
  };
  for (const module of modules) {
    const section = el('section', 'module-section', el('h3', '', String(module.title)));
    section.append(form('Edit module', moduleFields, module, `/admin/operations/programs/${id}/modules/${module.id}`, 'PATCH'));
    for (const lesson of (Array.isArray(module.lessons) ? module.lessons : []) as RecordData[]) section.append(form(String(lesson.title), lessonFields, lesson, `/admin/operations/modules/${module.id}/lessons/${lesson.id}`, 'PATCH'));
    section.append(form('Add lesson', lessonFields, {}, `/admin/operations/modules/${module.id}/lessons`)); content.append(section);
  }
  content.append(form('Add module', moduleFields, {}, `/admin/operations/programs/${id}/modules`));
  if (item.type === 'LIVE') {
    for (const session of (Array.isArray(item.liveSessions) ? item.liveSessions : []) as RecordData[]) content.append(form(String(session.title), liveFields, session, `/admin/operations/programs/${id}/live-sessions/${session.id}`, 'PATCH', { providerRef: session.providerRef ?? null }));
    content.append(form('Add live session', liveFields, {}, `/admin/operations/programs/${id}/live-sessions`, 'POST', { providerRef: null }));
  }
  return section('Curriculum & sessions', content, 'Edit a draft with no enrollments. Published or enrolled curriculum requires a new program version. Secure media and live providers are managed separately.');
}
function userActivity(id: string, context: PageContext) {
  const navigation = el('nav', 'activity-navigation'), body = el('div'); navigation.setAttribute('aria-label', 'User activity views');
  const kinds = [{ id: 'programs', label: 'Programs' }, { id: 'orders', label: 'Orders' }, { id: 'appointments', label: 'Consultations' }, { id: 'memberships', label: 'Memberships' }];
  const columns: Record<string, Column[]> = {
    programs: [{ key: 'program.title', label: 'Program' }, { key: 'status', label: 'Progress', kind: 'status' }, { key: 'enrolledAt', label: 'Enrolled', kind: 'date' }],
    orders: [{ key: 'id', label: 'Order reference' }, { key: 'status', label: 'Status', kind: 'status' }, { key: 'totalPaise', label: 'Total', kind: 'money' }, { key: 'createdAt', label: 'Placed', kind: 'date' }],
    appointments: [{ key: 'id', label: 'Consultation reference' }, { key: 'startsAt', label: 'Appointment', kind: 'date' }, { key: 'status', label: 'Status', kind: 'status' }, { key: 'feePaise', label: 'Fee', kind: 'money' }],
    memberships: [{ key: 'plan.name', label: 'Plan' }, { key: 'status', label: 'Status', kind: 'status' }, { key: 'periodEnd', label: 'Term ends', kind: 'date' }],
  };
  let selected = 'programs', version = 0; const pages: Record<string, number> = { programs: 1, orders: 1, appointments: 1, memberships: 1 };
  const buttons = kinds.map(kind => {
    const choice = button(kind.label, () => { selected = kind.id; render(); }); choice.setAttribute('aria-pressed', String(selected === kind.id)); navigation.append(choice); return { kind, choice };
  });
  function render() {
    for (const { kind, choice } of buttons) { const active = selected === kind.id; choice.className = `button ${active ? 'primary' : 'secondary'}`; choice.setAttribute('aria-pressed', String(active)); }
    const current = ++version, kind = selected, page = pages[kind] ?? 1;
    const scoped = { ...context, alive: () => context.alive() && current === version };
    void load(body, scoped, () => context.api.request<ListResult>(`/admin/operations/users/${encodeURIComponent(id)}/activity?kind=${kind}&page=${page}`), result => {
      if (!result.items.length) body.append(empty('No activity yet', `This account has no ${kind === 'appointments' ? 'consultation' : kind} activity on this page.`));
      else body.append(table(result.items, columns[kind]!, ['orders', 'appointments'].includes(kind) ? kind : undefined));
      const previous = button('← Previous', () => { pages[kind] = page - 1; render(); }); previous.disabled = page <= 1;
      const next = button('Next →', () => { pages[kind] = page + 1; render(); }); next.disabled = !result.hasMore;
      body.append(el('nav', 'pagination', previous, el('span', '', `Page ${result.page}`), next));
    });
  }
  render(); return section('Operational history', el('div', '', navigation, body), 'View this user’s program, order, consultation and membership activity. Clinical notes and private conversations are excluded.');
}
export function settingsPage(context: PageContext) {
  const page = el('div', '', heading('Platform settings', 'A secret-free view of configured services and approved policies.')), body = el('div'); page.append(body);
  void load(body, context, () => context.api.request<Settings>('/admin/operations/settings'), data => {
    body.append(section('Environment', el('div', '', badge(data.environment), readiness(data.readiness))));
    const policies = el('div', 'policy-list');
    for (const policy of data.policies) {
      const row = el('article', 'policy-row', el('h3', '', human(policy.type)), el('p', '', `Version ${policy.version || 'not set'}`), badge(policy.approved ? 'APPROVED' : 'APPROVAL_REQUIRED'));
      try { const url = new URL(policy.url); if (url.protocol === 'https:' && !url.username && !url.password) { const a = el('a', 'row-link', 'Read policy ↗'); a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; row.append(a); } } catch { /* Unconfigured policies remain visible without unsafe links. */ }
      policies.append(row);
    }
    body.append(section('Policy approvals', data.policies.length ? policies : empty('No policy versions configured', 'Business and legal approvals must be recorded before release.')));
  }); return page;
}
export function revenuePage(context: PageContext) {
  const page = el('div', '', heading('Revenue overview', 'Server-verified ledger totals. Keep development transactions separate from commercial reporting.'));
  const controls = el('form', 'toolbar'), days = el('select'); days.setAttribute('aria-label', 'Reporting period');
  for (const value of [7, 30, 90, 365]) { const option = el('option', '', `Last ${value} days`); option.value = String(value); option.selected = value === 30; days.append(option); }
  const demo = el('input'); demo.type = 'checkbox'; demo.id = 'revenue-demo'; const label = el('label', 'check-field', demo, 'Development transactions only');
  const submit = el('button', 'button secondary', 'Apply'); submit.type = 'submit'; controls.append(days, label, submit); const body = el('div'); page.append(controls, body); let version = 0;
  function fetchRevenue() {
    const current = ++version, includeDemo = demo.checked; void load(body, { ...context, alive: () => context.alive() && version === current }, () => context.api.request<RecordData>(`/admin/revenue?days=${days.value}&demo=${includeDemo}`), data => {
      body.append(notice(includeDemo ? 'Development reporting · simulated payments only. Production payments excluded.' : 'Commercial reporting · development payments excluded.'));
      for (const key of ['totals', 'dailyRevenue', 'monthlyRevenue', 'revenue', 'monthly']) {
        const rows = data[key]; if (!Array.isArray(rows)) continue;
        const normalized = rows.map(row => { const r = row as RecordData; return { ...r, amountPaise: r.amountPaise ?? r.amount ?? (r._sum as RecordData | undefined)?.amountPaise, count: r.count ?? (r._count as RecordData | undefined)?._all }; });
        body.append(section(human(key.replace(/([a-z])([A-Z])/g, '$1 $2')), rows.length ? table(normalized, [{ key: 'month', label: 'Month' }, { key: 'day', label: 'Day' }, { key: 'source', label: 'Source' }, { key: 'currency', label: 'Currency' }, { key: 'status', label: 'Payment status', kind: 'status' }, { key: 'count', label: 'Transactions' }, { key: 'amountPaise', label: 'Amount', kind: 'money' }]) : empty('No revenue in this period', 'Verified payment activity will appear here.')));
      }
      body.append(el('p', 'fine-print', 'Revenue views are operational reports. Provider settlement, refund completion, tax treatment and accounting approval are separate controls.'));
    });
  }
  controls.addEventListener('submit', event => { event.preventDefault(); fetchRevenue(); }); fetchRevenue(); return page;
}
