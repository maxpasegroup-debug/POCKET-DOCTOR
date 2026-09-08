import fs from 'node:fs';
import path from 'node:path';
const skip = new Set(['node_modules', 'build', 'dist', '.dart_tool', '.gradle', '.git', '.codex', '.agents', 'artifacts', 'generated', 'Pods', '.symlinks']);
const rules = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['provider secret', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['AWS credential', /\bAKIA[A-Z0-9]{16}\b/],
  ['GitHub credential', /\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['database password URL', /postgres(?:ql)?:\/\/[^\s:/'"`]+:([^\s@/'"`]+)@/g],
];
const findings = []; let files = 0;
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skip.has(entry.name) || entry.isSymbolicLink()) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { visit(file); continue; }
    if (/\.(jks|keystore|p12|mobileprovision)$/i.test(entry.name)) { findings.push({ file, rule: 'private signing file' }); continue; }
    // Local secret-store files are outside the source scan; never print their contents.
    if (/^\.env(?:\.|$)/.test(entry.name) && !entry.name.endsWith('.example')) continue;
    if (!/\.(?:ts|js|mjs|dart|json|yaml|yml|md|sql|kt|kts|xml|html|css|example|properties|sh|ps1)$/.test(entry.name) && !['Dockerfile', '.gitignore'].includes(entry.name)) continue;
    if (fs.statSync(file).size > 2000000 || /package-lock\.json$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8'); files++;
    for (const [name, regex] of rules) {
      regex.lastIndex = 0;
      for (const match of text.matchAll(new RegExp(regex.source, 'g'))) {
        if (name === 'database password URL' && /\$\{|\$[A-Za-z_]|<|YOUR_|REPLACE|example|placeholder/.test(match[1])) continue;
        findings.push({ file: file.replaceAll(path.sep, '/'), rule: name });
      }
    }
  }
}
visit('.');
console.log(JSON.stringify({ status: findings.length ? 'FAIL' : 'PASS', files, findings, scope: 'Source/config/docs patterns only; no Git history or external secret-store audit' }, null, 2));
if (findings.length) process.exitCode = 1;
