import { mkdir, lstat, realpath, chmod, chown } from 'node:fs/promises';
import { EnvironmentConfigurationError, readEnvironment } from './config/env.js';
import { assertRailwayVolume, credentialRoot, signatureRoot } from './modules/doctor-registration/railway-volume.js';

async function main() {
  const env = readEnvironment();
  assertRailwayVolume(env);
  if (process.getuid?.() !== 0) throw new Error('Volume provisioning requires root');
  // Fixed paths only. Never recursively chown an existing volume or follow symlinks.
  for (const directory of ['/data/pocketdoctor', credentialRoot, signatureRoot]) {
    await mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const st = await lstat(directory);
    if (!st.isDirectory() || st.isSymbolicLink() || await realpath(directory) !== directory) throw new Error('Invalid private directory');
    await chown(directory, 1000, 1000); // node user in the pinned Node image family
    await chmod(directory, 0o700);
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof EnvironmentConfigurationError ? error.message :
    'Private credential volume initialization failed. Check mount, configuration and permissions.');
  process.exitCode = 1;
});
