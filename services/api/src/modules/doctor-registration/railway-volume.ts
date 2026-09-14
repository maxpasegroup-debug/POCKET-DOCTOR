import { lstatSync, realpathSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';

export const credentialRoot = '/data/pocketdoctor/credentials';
export const signatureRoot = '/data/pocketdoctor/clamav';
const failure = () => new ApiError(503, 'PRIVATE_STORAGE_UNAVAILABLE', 'Secure storage or document scanning is unavailable. Please retry later.');

// A writable directory or a caller-supplied environment variable is not mount evidence.
export function hasDataMount(mountinfo: string): boolean {
  const mounts = mountinfo.trim().split('\n').map(line => line.split(' '));
  return mounts.some(fields => fields[4] === '/data' && fields[5]?.split(',').includes('rw') &&
      ['ext4', 'xfs', 'btrfs'].includes(fields[fields.indexOf('-') + 1] ?? '')) &&
    !mounts.some(fields => fields[4]?.startsWith('/data/'));
}
export function assertRailwayVolume(env: Environment): void {
  if (process.platform !== 'linux' || env.RAILWAY_VOLUME_MOUNT_PATH !== '/data' ||
      env.DOCTOR_CREDENTIAL_ROOT !== credentialRoot || env.DOCTOR_CREDENTIAL_SCANNER !== '/usr/bin/clamscan' ||
      !/^[A-Za-z0-9+/]{43}=$/.test(env.DOCTOR_CREDENTIAL_KEY) || !env.DOCTOR_REQUIRED_CREDENTIALS ||
      env.DOCTOR_REGISTRATION_DEFER_DOCUMENTS !== 'false') throw failure();
  try {
    if (!hasDataMount(readFileSync('/proc/self/mountinfo', 'utf8')) ||
        !lstatSync('/data').isDirectory() || realpathSync('/data') !== '/data') throw failure();
  } catch { throw failure(); }
}

export type ScannerCommand = (executable: string, args: string[], timeout: number) => Promise<void>;
const exec = promisify(execFile);
const run: ScannerCommand = async (executable, args, timeout) => {
  // Output may include private paths or malware details. Never log or return it.
  await exec(executable, args, { timeout, killSignal: 'SIGKILL', maxBuffer: 65536 });
};

export function clamavScanner(command: ScannerCommand = run) {
  let lastUpdate = 0;
  let updating: Promise<void> | undefined;
  let scanning = false;
  const refresh = async (timeout: number) => {
    if (Date.now() - lastUpdate < 12 * 60 * 60 * 1000) return;
    if (!updating) updating = command('/usr/bin/freshclam', [
      '--config-file=/app/ops/freshclam.conf', '--stdout', '--quiet',
    ], timeout).then(() => { lastUpdate = Date.now(); }).finally(() => { updating = undefined; });
    try { await updating; } catch { throw failure(); }
  };
  return {
    // Bootstrap before traffic; downloading official signatures may take longer.
    initialize: () => refresh(120000),
    scan: async (file: string) => {
      // Bound memory/CPU; retrying callers do not build an unbounded scan queue.
      if (scanning) throw failure();
      scanning = true;
      try {
        await refresh(20000);
        await command('/usr/bin/clamscan', [
          '--database=' + signatureRoot, '--official-db-only=yes', '--no-summary', '--infected',
          '--tempdir=' + credentialRoot, '--max-filesize=6M', '--max-scansize=25M',
          '--max-files=100', '--max-recursion=10', '--alert-exceeds-max=yes',
          '--alert-encrypted=yes', '--follow-file-symlinks=0', '--', file,
        ], 60000);
      } catch { throw failure(); } finally { scanning = false; }
    },
  };
}

export const railwayScanner = clamavScanner();
