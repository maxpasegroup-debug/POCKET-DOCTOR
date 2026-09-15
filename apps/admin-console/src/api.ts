export function validateApiBase(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Set a valid API address before opening the console.'); }
  if (url.username || url.password || url.search || url.hash ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))))
    throw new Error('The API must use HTTPS, except for local development.');
  return url.href.replace(/\/$/, '');
}
export function isLoopback(host: string) { return ['localhost', '127.0.0.1', '[::1]'].includes(host); }
export function browserApiBase(configured: string | undefined, development: boolean, devProxy: boolean, origin: string): string {
  if (development && devProxy) {
    const page = new URL(origin);
    if (page.protocol !== 'http:' || !isLoopback(page.hostname)) throw new Error('Development API forwarding requires a local console.');
    return validateApiBase(page.origin + '/api/v1');
  }
  return validateApiBase(configured ?? (development ? 'http://127.0.0.1:3000/api/v1' : ''));
}
export function isAdmin(user: { roles?: unknown }): boolean { return Array.isArray(user.roles) && user.roles.includes('ADMIN'); }
export class StaleRequest extends Error { constructor() { super('This request belongs to an earlier session.'); } }
export class ApiClient {
  private token = '';
  private generation = 0;
  private pending = new Set<AbortController>();
  constructor(private base: string, private expired: () => void, private stepUp: () => void,
    private transport: typeof fetch = (...args) => globalThis.fetch(...args)) {}
  private invalidate() { this.generation++; for (const controller of this.pending) controller.abort(); this.pending.clear(); }
  setToken(token: string) { this.invalidate(); this.token = token; }
  clear() { this.invalidate(); this.token = ''; }
  async logout() {
    // Start revocation with the existing credential, then immediately clear local state.
    const token = this.token; this.clear();
    if (!token) return;
    try {
      const response = await this.transport(this.base + '/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(12000) });
      if (!response.ok && response.status !== 401) throw new Error();
    } catch { throw new Error('You are signed out here. Server sign-out could not be confirmed.'); }
  }
  async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid API route.');
    const generation = this.generation, controller = new AbortController(); this.pending.add(controller);
    const check = () => { if (generation !== this.generation) throw new StaleRequest(); };
    try {
      let response: Response;
      try {
        response = await this.transport(this.base + path, { method, cache: 'no-store', credentials: 'omit',
          headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      } catch { check(); throw new Error('We could not connect. Check your connection and try again.'); }
      check();
      if (response.status === 401) { this.clear(); this.expired(); throw new StaleRequest(); }
      let payload: { data?: T; error?: { code?: string }; code?: string };
      try { payload = await response.json(); } catch { check(); throw new Error('We could not read the response. Please try again.'); }
      check();
      if (response.status === 403 && (payload.error?.code ?? payload.code) === 'ADMIN_STEP_UP_REQUIRED') { this.stepUp(); throw new StaleRequest(); }
      if (response.status === 403 && payload.error?.code === 'TEST_LOGIN_NOT_ALLOWED') throw new Error('This staging administrator is not configured for testing. The platform owner must configure the Admin account and authenticator.');
      if (response.status === 403 && payload.error?.code === 'ADMIN_LOGIN_NOT_ALLOWED') throw new Error('An active administrator account is required.');
      if (!response.ok) throw new Error(response.status === 403 ? 'Your account cannot perform this action.' :
        response.status === 409 ? 'This record changed or the action is unavailable. Refresh and try again.' :
        response.status === 400 ? 'Please check the entered values and try again.' :
        response.status === 429 ? 'Please wait a moment before trying again.' :
        response.status === 503 ? 'This service is not configured or available yet.' : 'We could not complete the request. Please try again.');
      if (!('data' in payload)) throw new Error('We could not read the response. Please try again.');
      return payload.data as T;
    } finally { this.pending.delete(controller); }
  }
}
