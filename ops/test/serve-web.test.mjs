import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

test('web serving protects paths, serves SPA routes and applies cache/CSP policy', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pocket-web-test-'));
  await fs.writeFile(path.join(root, 'index.html'), '<html><body>Pocket Doctor release test</body></html>');
  await fs.writeFile(path.join(root, 'app.js'), 'void 0;');
  const reservation = net.createServer(); await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port; await new Promise(r => reservation.close(r));
  const child = spawn(process.execPath, ['ops/serve-web.mjs'], { env: { ...process.env, STATIC_ROOT: root, PORT: String(port), HOST: '127.0.0.1', API_PUBLIC_ORIGIN: 'https://api.example.invalid' }, stdio: 'ignore', windowsHide: true });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) { try { ready = (await fetch(`${base}/__health`)).ok; } catch { /* Startup only. */ } if (ready) break; await new Promise(r => setTimeout(r, 50)); }
    assert.equal(ready, true);
    const page = await fetch(`${base}/programs/example`);
    assert.equal(page.status, 200); assert.match(await page.text(), /Pocket Doctor/);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
    assert.match(page.headers.get('content-security-policy'), /connect-src 'self' https:\/\/api\.example\.invalid;/);
    const script = await fetch(`${base}/app.js`, { method: 'HEAD' });
    assert.match(script.headers.get('content-type'), /javascript/); assert.equal(await script.text(), '');
    assert.equal((await fetch(`${base}/missing.js`)).status, 404);
    assert.equal((await fetch(`${base}/%2e%2e%5csecret.txt`)).status, 404);
    assert.equal((await fetch(`${base}/app.js`, { method: 'POST' })).status, 405);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise(r => child.once('exit', r)); child.kill(); await closed;
    }
    const resolved = path.resolve(root), temporary = path.resolve(os.tmpdir()) + path.sep;
    if (!resolved.startsWith(temporary) || !path.basename(resolved).startsWith('pocket-web-test-')) throw Error('Cleanup scope');
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
