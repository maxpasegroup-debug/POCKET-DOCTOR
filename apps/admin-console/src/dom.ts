export type Child = Node | string | number | null | undefined;
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className;
  for (const child of children) if (child !== undefined && child !== null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
export function button(label: string, action: () => void | Promise<void>, className = 'button secondary') {
  const node = el('button', className, label); node.type = 'button'; node.addEventListener('click', () => { void action(); }); return node;
}
export function link(label: string, route: string, className = '') { const node = el('a', className, label); node.href = '#' + route; return node; }
export function notice(message: string, error = false) { const node = el('p', error ? 'notice error' : 'notice', message); node.setAttribute('role', error ? 'alert' : 'status'); return node; }
export function loading() { const node = el('div', 'state', el('span', 'spinner'), el('p', '', 'Loading your workspace…')); node.setAttribute('role', 'status'); return node; }
export function empty(title: string, detail: string) { return el('div', 'state', el('span', 'empty-mark', '—'), el('h3', '', title), el('p', '', detail)); }
export function failure(error: unknown, retry: () => void) { return el('div', 'state', notice(error instanceof Error ? error.message : 'We could not load this view.', true), button('Try again', retry)); }
export function human(value: string) { return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }
export function badge(value: unknown) {
  const raw = String(value ?? 'Not set');
  const state = /^(ACTIVE|VERIFIED|PUBLISHED|DELIVERED|READY|ENABLED|COMPLETED|APPROVED)$/i.test(raw) ? 'good' : /FAILED|REJECTED|SUSPENDED|DISABLED|BLOCKED/i.test(raw) ? 'bad' : 'neutral';
  return el('span', `badge ${state}`, human(raw));
}
export function date(value: unknown): string {
  if (!value) return '—'; const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
export function money(value: unknown, currency = 'INR') { return typeof value === 'number' ? new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value / 100) : '—'; }
export function confirmAction(title: string, description: string): Promise<boolean> {
  return new Promise(resolve => {
    const dialog = el('dialog', 'confirm-dialog'), cancel = button('Keep unchanged', () => dialog.close('cancel'));
    const heading = el('h2', '', title); heading.id = 'confirm-title'; dialog.setAttribute('aria-labelledby', heading.id);
    dialog.append(heading, el('p', '', description), el('div', 'actions', cancel, button('Confirm action', () => dialog.close('confirm'), 'button primary')));
    dialog.addEventListener('close', () => { const confirmed = dialog.returnValue === 'confirm'; dialog.remove(); resolve(confirmed); }, { once: true });
    document.body.append(dialog); dialog.showModal(); cancel.focus();
  });
}
