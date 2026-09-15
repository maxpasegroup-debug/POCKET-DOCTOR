import './style.css';
import { browserApiBase, StaleRequest } from './api.ts';
import { AdminAuth } from './auth.ts';
import { domains, routeFromHash } from './catalog.ts';
import { button, el, empty, link, notice } from './dom.ts';
import { dashboard, detailPage, listPage, revenuePage, settingsPage, type PageContext } from './pages.ts';

const root = document.querySelector<HTMLElement>('#app')!;
let generation = 0;
let auth: AdminAuth;
function clearView() { generation++; root.replaceChildren(); }
function render() {
  if (!auth.authenticated) return;
  const version = ++generation, route = routeFromHash(location.hash);
  const sidebar = el('aside', 'sidebar'), nav = el('nav', 'primary-nav'); nav.setAttribute('aria-label', 'Operations workspace');
  sidebar.id = 'workspace-sidebar';
  sidebar.append(el('div', 'sidebar-brand', el('div', 'wordmark', 'POCKET DOCTOR'), el('p', 'tagline', 'Your Doctor. In Your Pocket.')), el('p', 'workspace-label', 'CONTROL CENTER'));
  const navigation = (title: string, target: string) => { const a = link(title, '/' + target, 'nav-link'); if (route.domain === target) { a.classList.add('selected'); a.setAttribute('aria-current', 'page'); } return a; };
  nav.append(navigation('Overview', 'dashboard'));
  let group = '';
  for (const domain of domains) {
    if (group !== domain.group) { group = domain.group; nav.append(el('p', 'nav-group', group)); }
    nav.append(navigation(domain.title, domain.id));
    if (domain.id === 'payments') nav.append(navigation('Revenue overview', 'revenue'));
  }
  nav.append(navigation('Platform settings', 'settings'));
  sidebar.append(nav, el('div', 'sidebar-footer', el('span', 'security-dot'), el('span', '', auth.security?.mode === 'development' ? 'Local security mode' : 'Verified admin session')));
  const menu = button('☰ Menu', () => {
    const expanded = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(expanded)); sidebar.classList.toggle('mobile-open', expanded);
  }, 'button menu-button'); menu.setAttribute('aria-controls', sidebar.id); menu.setAttribute('aria-expanded', 'false');
  const environment = el('span', 'environment-pill', 'Checking environment…'), header = el('header', 'topbar', el('div', 'topbar-left', menu, el('span', 'workspace-title', 'Operations workspace')), el('div', 'topbar-actions', environment, button('Sign out', () => auth.logout(), 'button text-button')));
  const main = el('main', 'main-content'); main.id = 'main-content';
  const context: PageContext = { api: auth.api, alive: () => generation === version && auth.authenticated, reload: render };
  let view: HTMLElement;
  const domain = domains.find(d => d.id === route.domain);
  if (route.domain === 'dashboard') view = dashboard(context);
  else if (route.domain === 'settings') view = settingsPage(context);
  else if (route.domain === 'revenue') view = revenuePage(context);
  else if (domain) view = route.id ? detailPage(domain, route.id, context) : listPage(domain, context);
  else view = el('div', '', empty('This page is not available', 'Choose a workspace from the menu.'), link('Return to overview', '/dashboard', 'button primary'));
  main.append(view);
  const skip = el('a', 'skip-link', 'Skip to workspace'); skip.href = '#main-content'; skip.addEventListener('click', event => { event.preventDefault(); main.tabIndex = -1; main.focus(); });
  root.replaceChildren(skip, el('div', 'app-layout', sidebar, el('div', 'workspace', header, main, el('footer', 'workspace-footer', 'POCKET DOCTOR', el('span', '', 'Operational access · Actions are audited')))));
  document.title = `${domain?.title ?? (route.domain === 'dashboard' ? 'Overview' : route.domain === 'revenue' ? 'Revenue' : 'Settings')} · Pocket Doctor`;
  void auth.api.request<{ environment: string; readiness: { name: string; status: string }[] }>('/admin/operations/settings').then(data => {
    if (!context.alive()) return; const configured = data.readiness.filter(r => /^(READY|ENABLED)$/i.test(r.status)).length;
    environment.textContent = `${data.environment} · ${configured}/${data.readiness.length} services ready`;
  }).catch(error => { if (context.alive() && !(error instanceof StaleRequest)) environment.textContent = 'Readiness unavailable'; });
}
try {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const base = browserApiBase(configured, import.meta.env.DEV, import.meta.env.VITE_DEV_API_PROXY === true, location.origin);
  auth = new AdminAuth(root, base, render, clearView, configured ?? base);
  window.addEventListener('hashchange', () => { if (auth.authenticated) render(); });
  auth.reset();
} catch (error) { root.append(el('main', 'configuration-error', el('h1', '', 'Console configuration needed'), notice((error as Error).message, true), el('p', '', 'Set VITE_API_BASE_URL to the approved API address and rebuild the console.'))); }
