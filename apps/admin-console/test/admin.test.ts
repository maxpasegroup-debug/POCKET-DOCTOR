import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient, isAdmin, StaleRequest, validateApiBase } from '../src/api.ts';
import { displayValue, domains, refundActionState, routeFromHash, valueAt } from '../src/catalog.ts';
import { parseField } from '../src/forms.ts';
import { minutes, validateWindows } from '../src/availability.ts';

test('API configuration allows HTTPS and loopback only; rejects credentials and query secrets', () => {
  assert.equal(validateApiBase('https://api.example.test/api/v1/'), 'https://api.example.test/api/v1');
  assert.equal(validateApiBase('http://127.0.0.1:3000/api/v1'), 'http://127.0.0.1:3000/api/v1');
  for (const input of ['', 'http://remote.test/api/v1', 'https://user:secret@api.test', 'https://api.test?token=x', 'https://api.test/#private', 'javascript:alert(1)']) assert.throws(() => validateApiBase(input));
});
test('role gate requires exact ADMIN role', () => {
  assert.equal(isAdmin({ roles: ['USER', 'ADMIN'] }), true);
  for (const roles of [undefined, 'ADMIN', ['DOCTOR'], ['admin'], ['ADMINISTRATOR']]) assert.equal(isAdmin({ roles }), false);
});
test('API sends bearer only in headers, omits cookies and unwraps data', async () => {
  const api = new ApiClient('https://api.test', () => {}, () => {}, async (url, init) => {
    assert.equal(url, 'https://api.test/admin/operations/users');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer transient');
    assert.equal(init?.credentials, 'omit'); assert.equal(init?.cache, 'no-store');
    return Response.json({ data: { items: [] } });
  });
  api.setToken('transient'); assert.deepEqual(await api.request('/admin/operations/users'), { items: [] });
});
test('unauthorized response clears session and invokes reset once', async () => {
  let expired = 0, calls = 0;
  const api = new ApiClient('', () => expired++, () => {}, async (_url, init) => {
    if (++calls === 1) return new Response(null, { status: 401 });
    assert.equal((init?.headers as Record<string, string>).Authorization, undefined); return Response.json({ data: {} });
  });
  api.setToken('transient'); await assert.rejects(api.request('/one'), StaleRequest); await api.request('/two'); assert.equal(expired, 1);
});
test('step-up response rechecks security without displaying server error', async () => {
  let stepUps = 0;
  const api = new ApiClient('', () => {}, () => stepUps++, async () => Response.json({ error: { code: 'ADMIN_STEP_UP_REQUIRED', message: 'secret' } }, { status: 403 }));
  await assert.rejects(api.request('/admin/operations/users'), StaleRequest); assert.equal(stepUps, 1);
});
test('obsolete response cannot repopulate a signed-out workspace', async () => {
  let resolve!: (response: Response) => void;
  const api = new ApiClient('', () => {}, () => {}, () => new Promise(done => { resolve = done; }));
  api.setToken('first'); const pending = api.request('/users'); api.clear();
  resolve(Response.json({ data: { fullName: 'Private' } })); await assert.rejects(pending, StaleRequest);
});
test('obsolete error response cannot terminate a newer session', async () => {
  let resolve!: (response: Response) => void; let expired = 0;
  const api = new ApiClient('', () => expired++, () => {}, () => new Promise(done => { resolve = done; }));
  api.setToken('old'); const pending = api.request('/users'); api.setToken('new');
  resolve(new Response(null, { status: 401 })); await assert.rejects(pending, StaleRequest); assert.equal(expired, 0);
});
test('logout revokes previous bearer and clears subsequent requests even when revocation fails', async () => {
  let calls = 0;
  const api = new ApiClient('', () => {}, () => {}, async (url, init) => {
    if (++calls === 1) { assert.equal(url, '/auth/logout'); assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer old'); throw new Error('offline'); }
    assert.equal((init?.headers as Record<string, string>).Authorization, undefined); return Response.json({ data: {} });
  }); api.setToken('old'); await assert.rejects(api.logout(), /signed out here/); await api.request('/public');
});
test('network and server failures have friendly text without provider details', async () => {
  const api = new ApiClient('', () => {}, () => {}, async () => Response.json({ error: { message: 'postgres credentials' } }, { status: 500 }));
  await assert.rejects(api.request('/users'), error => error instanceof Error && !error.message.includes('postgres') && error.message.includes('try again'));
  const offline = new ApiClient('', () => {}, () => {}, async () => { throw new Error('internal socket path'); });
  await assert.rejects(offline.request('/users'), /Check your connection/);
});
test('routes reject unknown domains, traversal and unsupported detail pages', () => {
  assert.deepEqual(routeFromHash('#/programs/new'), { domain: 'programs', id: 'new' });
  assert.deepEqual(routeFromHash('#/users/abc-123'), { domain: 'users', id: 'abc-123' });
  for (const path of ['#/programs/../../settings', '#/audit/secret', '#/users/%3Cscript%3E', '#/no-such-page', '#/users/new']) assert.equal(routeFromHash(path).domain, 'not-found');
});
test('explicit table columns never discover or serialize private values', () => {
  const privateKeys = ['notes', 'medicalHistory', 'prompt', 'memory', 'token', 'password', 'otpHash', 'body'];
  for (const domain of domains) for (const column of domain.columns) assert.equal(privateKeys.some(key => column.key.toLowerCase().includes(key.toLowerCase())), false);
  assert.equal(displayValue({ fullName: '<img src=x onerror=alert(1)>' }, { key: 'fullName', label: 'Name' }), '<img src=x onerror=alert(1)>');
  // Values remain text and are inserted by text nodes, not parsed HTML.
  assert.equal(displayValue({ private: { token: 'secret' } }, { key: 'private', label: 'Unknown' }), '—');
  assert.equal(valueAt(Object.create({ token: 'inherited' }), 'token'), undefined);
});
test('numeric form validation preserves zero, negatives where allowed and nullable fields', () => {
  assert.equal(parseField({ key: 'price', label: 'Price', type: 'number', min: 0 }, '0'), 0);
  assert.equal(parseField({ key: 'delta', label: 'Adjustment', type: 'number' }, '-3'), -3);
  assert.equal(parseField({ key: 'years', label: 'Experience', type: 'number', nullable: true }, ''), null);
  for (const value of ['', 'NaN', '1.5', '-1', '9007199254740993']) assert.throws(() => parseField({ key: 'price', label: 'Price', type: 'number', min: 0 }, value));
});
test('form parser constrains selects and HTTPS URLs, preserves line-based resources', () => {
  assert.deepEqual(parseField({ key: 'ids', label: 'Resources', type: 'lines' }, 'one\n\n two '), ['one', 'two']);
  assert.throws(() => parseField({ key: 'state', label: 'State', type: 'select', options: ['DRAFT'] }, 'PUBLISHED'));
  assert.throws(() => parseField({ key: 'image', label: 'Image', type: 'url' }, 'javascript:alert(1)'));
  assert.throws(() => parseField({ key: 'image', label: 'Image', type: 'url' }, 'https://secret@example.test/image'));
  assert.equal(parseField({ key: 'member', label: 'Member', type: 'checkbox' }, 'true'), false);
  assert.equal(parseField({ key: 'member', label: 'Member', type: 'checkbox' }, true), true);
});
test('dates and minimum required text fail early rather than send malformed payloads', () => {
  assert.throws(() => parseField({ key: 'name', label: 'Name', required: true }, '  '));
  assert.throws(() => parseField({ key: 'startsAt', label: 'Starts', type: 'datetime-local' }, 'not a date'));
  assert.match(String(parseField({ key: 'startsAt', label: 'Starts', type: 'datetime-local' }, '2026-09-10T12:00')), /^2026-09-10T/);
});
test('doctor availability accepts midnight and rejects overlaps and invalid times', () => {
  assert.equal(minutes('24:00', true), 1440);
  assert.throws(() => minutes('24:00')); assert.throws(() => minutes('09:99'));
  const window = { weekday: 1, startMinute: 540, endMinute: 600 };
  assert.deepEqual(validateWindows([window], 20), [window]);
  assert.throws(() => validateWindows([window, { ...window, startMinute: 580 }], 20), /overlap/);
  assert.throws(() => validateWindows([{ ...window, endMinute: 545 }], 20), /fit a consultation/);
});
test('refund actions require explicit readiness, captured Razorpay payment and correct lifecycle state', () => {
  const payment = { provider: 'razorpay', status: 'VERIFIED', refundStatus: 'REFUND_REQUESTED' };
  const ready = [{ name: 'Refund processing', status: 'CONFIGURED' }];
  assert.equal(refundActionState(payment, ready).process, true);
  for (const status of ['NOT CONFIGURED', 'LOCAL DEMO', 'CONFIGURED — VALIDATION REQUIRED', 'DISABLED']) assert.equal(refundActionState(payment, [{ name: 'Refund processing', status }]).process, false);
  assert.equal(refundActionState(payment, [{ name: 'Payments', status: 'READY' }]).process, false);
  assert.equal(refundActionState({ ...payment, provider: 'development' }, ready).process, false);
  assert.equal(refundActionState({ ...payment, status: 'FAILED' }, ready).process, false);
  assert.equal(refundActionState({ ...payment, refundStatus: 'REFUND_PROCESSING' }, ready).process, false);
  assert.equal(refundActionState({ ...payment, refundStatus: 'REFUND_PROCESSING' }, ready).reconcile, true);
  assert.equal(refundActionState({ ...payment, refundStatus: 'REFUNDED' }, ready).reconcile, false);
});
