import 'dotenv/config';
import { configuredRegistration } from './modules/doctor-registration/local-store.js';
import { buildApp } from './app.js';
import { EnvironmentConfigurationError, readEnvironment } from './config/env.js';
import { createDatabase } from './database/database.js';

async function main() {
  const env = readEnvironment();
  const database = env.DATABASE_URL ? createDatabase(env.DATABASE_URL) : undefined;
  const app = await buildApp(env, database, configuredRegistration(env));
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      const timeout = setTimeout(() => process.exit(1), 10000).unref();
      app.close().then(() => { clearTimeout(timeout); }, () => { process.exitCode = 1; });
    });
  }
  try {
    // Configured databases must be reachable before accepting traffic.
    await database?.ping();
    // Development codes must never be served on a public/LAN interface.
    await app.listen({ port: env.PORT, host: env.OTP_MODE === 'development' || env.PAYMENT_MODE === 'development' || env.DEMO_PROGRAMS === 'true' || env.DEMO_CONSULTATIONS === 'true' || env.DEMO_WELLNESS === 'true' ? '127.0.0.1' : env.HOST });
  } catch {
    app.log.fatal('Startup failed; check configuration and database availability.');
    await app.close();
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof EnvironmentConfigurationError
    ? error.message
    : 'Startup failed; check environment configuration.');
  process.exitCode = 1;
});
