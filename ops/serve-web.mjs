import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = await fs.realpath(process.env.STATIC_ROOT || 'dist');
const api = new URL(process.env.API_PUBLIC_ORIGIN || 'https://api.example.invalid');
if (api.protocol !== 'https:' || api.origin !== api.href.replace(/\/$/, '') || api.username || api.password) throw Error('Configure an exact HTTPS API origin');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = http.createServer(async (req, res) => {
  const headers = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
    'strict-transport-security': 'max-age=31536000', 'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ${api.origin}; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` };
  try {
    if (!['GET', 'HEAD'].includes(req.method || '')) { res.writeHead(405, headers); res.end(); return; }
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/__health') { res.writeHead(200, { ...headers, 'content-type': 'text/plain' }); res.end('ok'); return; }
    const requested = decodeURIComponent(url.pathname);
    let file = path.resolve(root, `.${requested}`);
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(404, headers); res.end(); return; }
    try { if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html'); }
    catch { if (path.extname(file)) { res.writeHead(404, headers); res.end(); return; } file = path.join(root, 'index.html'); }
    const real = await fs.realpath(file);
    if (!real.startsWith(root + path.sep)) { res.writeHead(404, headers); res.end(); return; }
    const bytes = await fs.readFile(real), extension = path.extname(real);
    res.writeHead(200, { ...headers, 'content-type': mime[extension] || 'application/octet-stream', 'cache-control': extension === '.html' ? 'no-store' : 'public, max-age=3600', 'content-length': bytes.length });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404, headers); res.end(); }
});
server.listen(Number(process.env.PORT || 8080), process.env.HOST || '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
