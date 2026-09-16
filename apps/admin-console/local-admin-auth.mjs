import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { totp } from '../../services/api/src/modules/admin/security.ts';

export function loadLocalAdminSetup(file) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const { TEST_ADMIN_USER_ID: userId, TEST_ADMIN_PHONE: phone } = data.operatorEnvironment;
    const key = data.ADMIN_TOTP_KEYS_ENTRY[userId];
    if (data.runtime.APP_ENV !== 'staging' || data.runtime.OTP_MODE !== 'testing' || data.runtime.ADMIN_SECURITY_MODE !== 'totp' ||
      !/^[0-9a-f-]{36}$/i.test(userId) || !/^\+91[6-9][0-9]{9}$/.test(phone) || !/^[A-Z2-7]{32,128}$/.test(key) ||
      data.OTP_TEST_ACCOUNTS_ENTRY[createHash('sha256').update(phone).digest('hex')] !== 'ADMIN') return undefined;
    return { userId, phone, key };
  } catch { return undefined; }
}

const localPath = '/_local/admin/elevate';
const hash = value => createHash('sha256').update(value).digest('hex');
const failure = (status, code) => ({ status, payload: { error: { code } } });

// This is a local Vite testing helper, never an API deployment component.
// The private key and generated authenticator code never enter browser responses.
export function createLocalAdminAuth({ apiBase, setup, transport = fetch, now = Date.now }) {
  const challenges = new Map(), sessions = new Map();
  const matches = user => user?.id === setup.userId && user.roles?.length === 1 && user.roles[0] === 'ADMIN';
  const prune = map => { for (const [key, expiry] of map) if (expiry <= now()) map.delete(key); };
  const record = (map, key, expiry) => {
    prune(map);
    if (map.size >= 32) map.delete(map.keys().next().value);
    map.set(key, expiry);
  };
  const forward = async (path, body, token, signal) => {
    const response = await transport(apiBase + path, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const reader = response.body?.getReader();
    let length = 0; const chunks = [];
    if (!reader) throw new Error();
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.length; if (length > 65536) throw new Error(); chunks.push(value);
      }
      return { status: response.status, payload: JSON.parse(Buffer.concat(chunks).toString('utf8')), serverTime: Date.parse(response.headers.get('date') ?? '') };
    } finally { await reader.cancel().catch(() => {}); }
  };
  async function handle(path, body, authorization) {
    const signal = AbortSignal.timeout(12000);
    prune(challenges); prune(sessions);
    try {
      if (path === '/auth/otp/request') {
        const result = await forward(path, body, undefined, signal);
        const data = result.payload.data;
        if (result.status === 200 && body.context === 'ADMIN' && body.phone === setup.phone &&
          data?.delivery === 'testing' && typeof data.challengeId === 'string') {
          record(challenges, data.challengeId, now() + 300000);
        }
        return result;
      }
      if (path === '/auth/otp/verify') {
        const witnessedTesting = challenges.has(body.challengeId) && body.context === 'ADMIN';
        const result = await forward(path, body, undefined, signal), data = result.payload.data;
        if (result.status === 200) challenges.delete(body.challengeId);
        if (result.status === 200 && witnessedTesting && matches(data?.user) && /^[A-Za-z0-9_-]{43}$/.test(data?.token ?? '')) {
          const expiry = Math.min(Date.parse(data.expiresAt), now() + 3600000);
          if (expiry > now()) record(sessions, hash(data.token), expiry);
        }
        return result;
      }
      if (path !== localPath) return failure(404, 'NOT_FOUND');
      const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? '')?.[1];
      if (!token || !sessions.has(hash(token))) return failure(403, 'LOCAL_TEST_SESSION_REQUIRED');
      const identity = await forward('/auth/session', undefined, token, signal);
      if (identity.status !== 200 || !matches(identity.payload.data?.user)) {
        sessions.delete(hash(token)); return failure(401, 'UNAUTHENTICATED');
      }
      // Reuse the backend's RFC 6238 implementation and existing MFA endpoint.
      // Railway's authenticated HTTPS response supplies the verifier's clock;
      // a misconfigured workstation clock must not generate an invalid code.
      if (!Number.isFinite(identity.serverTime)) return failure(503, 'LOCAL_TEST_CHECK_UNAVAILABLE');
      const code = totp(setup.key, BigInt(Math.floor(identity.serverTime / 30000)));
      const result = await forward('/admin/session/elevate', { code }, token, signal);
      return result.status === 200 && result.payload.data?.elevated === true
        ? { status: 200, payload: { data: { elevated: true } } }
        : failure(result.status >= 400 ? result.status : 502, 'LOCAL_TEST_CHECK_FAILED');
    } catch { return failure(503, 'LOCAL_TEST_CHECK_UNAVAILABLE'); }
  }
  async function middleware(request, response, next) {
    const path = (request.url ?? '').replace(/^\/api\/v1/, '');
    if (!['/auth/otp/request', '/auth/otp/verify', localPath].includes(path)) return next();
    const reply = ({ status, payload }) => {
      response.statusCode = status; response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store'); response.end(JSON.stringify(payload));
    };
    if (request.method !== 'POST') return reply(failure(405, 'METHOD_NOT_ALLOWED'));
    if (!request.headers['content-type']?.startsWith('application/json')) return reply(failure(400, 'INVALID_REQUEST'));
    try {
      let length = 0; const chunks = [];
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 4096) return reply(failure(413, 'INVALID_REQUEST'));
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(failure(400, 'INVALID_REQUEST'));
      reply(await handle(path, body, request.headers.authorization));
    } catch { reply(failure(400, 'INVALID_REQUEST')); }
  }
  return { handle, middleware };
}
