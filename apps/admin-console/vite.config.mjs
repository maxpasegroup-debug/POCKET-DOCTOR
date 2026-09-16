import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import { createLocalAdminAuth, loadLocalAdminSetup } from './local-admin-auth.mjs';

// Only the loopback Vite development server forwards requests. Production
// builds continue to call the configured HTTPS API and use its CORS policy.
export function adminDevelopmentConfig({ command, isPreview = false, apiBase, localAdminSetup }) {
  const inactive = { define: { 'import.meta.env.VITE_DEV_API_PROXY': 'false', 'import.meta.env.VITE_LOCAL_ADMIN_AUTO_CHECK': 'false' } };
  if (command !== 'serve' || isPreview || !apiBase) return inactive;
  const target = new URL(apiBase);
  if (target.protocol !== 'https:') return inactive;
  if (target.username || target.password || target.search || target.hash || target.pathname.replace(/\/$/, '') !== '/api/v1') {
    throw new Error('Admin development forwarding requires an HTTPS API base ending in /api/v1.');
  }
  return {
    define: { 'import.meta.env.VITE_DEV_API_PROXY': 'true', 'import.meta.env.VITE_LOCAL_ADMIN_AUTO_CHECK': localAdminSetup ? 'true' : 'false' },
    server: {
      host: '127.0.0.1',
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/artifacts/**'] },
      proxy: {
        '^/api/v1(?:/|$)': {
          target: target.origin, changeOrigin: true, secure: true,
          timeout: 12000, proxyTimeout: 12000,
          configure(proxy) {
            // Admin auth uses Bearer headers, never browser cookies.
            proxy.on('proxyReq', proxyRequest => proxyRequest.removeHeader('cookie'));
          },
        },
      },
    },
    plugins: [{
      name: 'private-admin-development-api',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (!/^\/api\/v1(?:\/|$)/.test(request.url ?? '')) return next();
          const host = request.headers.host ?? '';
          const origin = request.headers.origin;
          // Reject cross-site browser requests to this local forwarding endpoint.
          if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) ||
            (origin && origin !== `http://${host}`) || request.headers['sec-fetch-site'] === 'cross-site') {
            response.statusCode = 403;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ error: { code: 'LOCAL_ORIGIN_NOT_ALLOWED' } }));
            return;
          }
          next();
        });
        if (localAdminSetup) server.middlewares.use(createLocalAdminAuth({ apiBase, setup: localAdminSetup }).middleware);
      },
    }],
  };
}

export default defineConfig(({ command, mode, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const hosted = mode === 'railway-testing'
    ? JSON.parse(readFileSync(new URL('./config/railway-testing.json', import.meta.url), 'utf8')).apiBaseUrl
    : undefined;
  const apiBase = process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL ?? hosted;
  const localAdminSetup = command === 'serve' && !isPreview && mode === 'railway-testing' && apiBase === hosted
    ? loadLocalAdminSetup(new URL('../../artifacts/staging-admin-private-setup.json', import.meta.url)) : undefined;
  const config = adminDevelopmentConfig({ command, isPreview, apiBase, localAdminSetup });
  return { ...config, define: { ...config.define, ...(apiBase ? { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBase) } : {}) } };
});
