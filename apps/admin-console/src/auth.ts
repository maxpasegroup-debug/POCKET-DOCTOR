import { ApiClient, isAdmin, isLoopback, StaleRequest } from './api.ts';
import { button, el, notice } from './dom.ts';
export interface SecurityStatus { mode: 'development' | 'totp' | 'disabled'; elevated: boolean }
export class AdminAuth {
  readonly api: ApiClient;
  private generation = 0;
  private signedIn = false;
  security: SecurityStatus | undefined;
  constructor(private root: HTMLElement, base: string, private ready: () => void, private clearView: () => void) {
    this.api = new ApiClient(base, () => this.reset('Your session has ended. Please sign in again.'), () => {
      if (this.security?.elevated === false) return;
      this.security = this.security ? { ...this.security, elevated: false } : undefined;
      this.clearView(); void this.elevate();
    });
    this.localDevelopment = import.meta.env.DEV && isLoopback(location.hostname) && isLoopback(new URL(base).hostname);
  }
  private localDevelopment: boolean;
  reset(message = '') {
    this.generation++; this.signedIn = false; this.security = undefined; this.api.clear(); this.clearView();
    for (const dialog of document.querySelectorAll('dialog')) dialog.remove(); this.login(message);
  }
  get authenticated() { return this.signedIn && this.security?.elevated === true; }
  async logout() {
    const revoke = this.api.logout(); this.reset('You have signed out.');
    try { await revoke; } catch (error) { if (!this.signedIn) this.login(error instanceof Error ? error.message : 'Server sign-out could not be confirmed.'); }
  }
  private layout(title: string, subtitle: string) {
    const heading = el('h1', '', title), panel = el('section', 'auth-panel', el('p', 'eyebrow', 'ADMINISTRATOR ACCESS'), heading, el('p', 'auth-intro', subtitle));
    heading.tabIndex = -1;
    this.root.replaceChildren(el('main', 'auth-layout', el('aside', 'auth-brand', el('div', 'wordmark', 'POCKET DOCTOR'), el('p', 'tagline', 'Your Doctor. In Your Pocket.'),
      el('div', 'auth-statement', el('p', 'eyebrow', 'THE OPERATIONS DESK'), el('h2', '', 'Care begins with\na well-run platform.'), el('p', '', 'One trusted workspace for your people, programs and everyday operations.')),
      el('p', 'auth-footnote', 'Restricted workspace · Authorized team members only')), panel));
    return panel;
  }
  login(message = '') {
    const version = this.generation, panel = this.layout('Welcome back.', 'Sign in with the mobile number linked to your administrator account.');
    if (message) panel.append(notice(message));
    const form = el('form', 'auth-form'), label = el('label', '', 'Mobile number'), phone = el('input');
    phone.id = 'admin-phone'; label.htmlFor = phone.id; phone.type = 'tel'; phone.autocomplete = 'tel'; phone.placeholder = '+91 98765 43210'; phone.required = true;
    const errorBox = el('div'), submit = el('button', 'button primary', 'Send verification code'); submit.type = 'submit';
    form.append(label, phone, el('small', '', 'India · enter +91 followed by your 10-digit number.'), errorBox, submit); panel.append(form, el('p', 'fine-print', 'Access is checked on the server. A second security check protects administrative actions.'));
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (submit.disabled) return; errorBox.replaceChildren();
      const number = phone.value.replace(/[\s()-]/g, '');
      if (!/^\+91[6-9]\d{9}$/.test(number)) { errorBox.append(notice('Enter a valid Indian mobile number including +91.', true)); return; }
      submit.disabled = true;
      try { const challenge = await this.api.request<{ challengeId: string; developmentCode?: string }>('/auth/otp/request', 'POST', { phone: number }); if (version === this.generation) this.otp(challenge, number); }
      catch (error) { if (version === this.generation && !(error instanceof StaleRequest)) errorBox.append(notice((error as Error).message, true)); }
      finally { submit.disabled = false; }
    });
  }
  private otp(challenge: { challengeId: string; developmentCode?: string }, phone: string) {
    const version = this.generation, panel = this.layout('Check your phone.', `Enter the six-digit code sent to ${phone}.`);
    if (this.localDevelopment && challenge.developmentCode) panel.append(notice(`Local development code: ${challenge.developmentCode}. No SMS was sent.`));
    const form = el('form', 'auth-form'), label = el('label', '', 'Verification code'), code = el('input'); code.id = 'admin-otp'; label.htmlFor = code.id;
    code.inputMode = 'numeric'; code.autocomplete = 'one-time-code'; code.pattern = '[0-9]{6}'; code.maxLength = 6; code.required = true;
    const errorBox = el('div'), submit = el('button', 'button primary', 'Verify and continue'); submit.type = 'submit';
    form.append(label, code, errorBox, submit, button('Use another number', () => { this.generation++; this.api.clear(); this.login(); }, 'button text-button')); panel.append(form);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (submit.disabled) return; submit.disabled = true; errorBox.replaceChildren();
      try {
        const result = await this.api.request<{ token: string; user: { roles: string[] } }>('/auth/otp/verify', 'POST', { challengeId: challenge.challengeId, code: code.value.trim() });
        if (version !== this.generation) return;
        this.api.setToken(result.token);
        if (!isAdmin(result.user)) { await this.api.logout().catch(() => {}); this.reset('An administrator account is required to use this workspace.'); return; }
        this.signedIn = true; await this.elevate();
      } catch (error) { if (version === this.generation && !(error instanceof StaleRequest)) errorBox.append(notice((error as Error).message, true)); }
      finally { submit.disabled = false; }
    }); code.focus();
  }
  async elevate() {
    const version = this.generation, panel = this.layout('One more security check.', 'Administrative access requires a current security verification.');
    const status = el('div', '', notice('Checking security settings…')); panel.append(status);
    try {
      const security = await this.api.request<SecurityStatus>('/admin/session/status'); if (version !== this.generation) return;
      this.security = security;
      if (security.elevated) { this.ready(); return; }
      status.replaceChildren();
      if (security.mode === 'disabled') { status.append(notice('Administrator security is not configured. Contact the platform owner.', true), button('Sign out', () => this.logout())); return; }
      const local = security.mode === 'development';
      if (local) status.append(notice('Local security mode. This development-only check cannot authorize a production console.'));
      const form = el('form', 'auth-form'), code = el('input'); code.id = 'admin-totp'; code.inputMode = 'numeric'; code.autocomplete = 'one-time-code'; code.pattern = '[0-9]{6}'; code.maxLength = 6; code.required = !local;
      if (!local) { const label = el('label', '', 'Authenticator code'); label.htmlFor = code.id; form.append(label, code); }
      const errorBox = el('div'), submit = el('button', 'button primary', local ? 'Enter local workspace' : 'Confirm secure access'); submit.type = 'submit';
      form.append(errorBox, submit, button('Sign out', () => this.logout(), 'button text-button')); status.append(form);
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (submit.disabled) return; submit.disabled = true; errorBox.replaceChildren();
        try { await this.api.request('/admin/session/elevate', 'POST', local ? {} : { code: code.value.trim() }); if (version === this.generation) { this.security = { ...security, elevated: true }; this.ready(); } }
        catch (error) { if (version === this.generation && !(error instanceof StaleRequest)) errorBox.append(notice((error as Error).message, true)); }
        finally { submit.disabled = false; }
      });
    } catch (error) { if (version === this.generation && !(error instanceof StaleRequest)) status.replaceChildren(notice((error as Error).message, true), button('Try again', () => this.elevate()), button('Sign out', () => this.logout())); }
  }
}
