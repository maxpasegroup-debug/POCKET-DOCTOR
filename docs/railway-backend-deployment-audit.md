# Pocket Doctor Railway backend deployment audit

Audit date: 2026-09-10. Scope: the existing Patient repository's shared API.
No deployment, Railway service creation, schema migration, production database
change, provider configuration, or Flutter modification was performed. Existing
integration tests use temporary synthetic records in the existing local test
database. Source changes from prior work were preserved.

## Backend and commands

| Item | Exact repository path / command |
| --- | --- |
| Backend root | `services/api` |
| Package and locked install | `services/api/package.json`, `services/api/package-lock.json`; `npm ci` |
| Framework/runtime | Fastify 5, Node 24 (`>=24 <25`), TypeScript, ESM |
| Development | `npm run dev` -> `tsx watch src/server.ts` |
| Entry / application | `src/server.ts`, `src/app.ts` |
| TypeScript | `tsconfig.json`, `tsconfig.build.json` |
| Production build | `npm run build` -> `npm run generate && tsc -p tsconfig.build.json` |
| Generation | `npm run generate` -> `prisma generate`; required, included in build |
| Production API | `npm start` -> `node dist/server.js` |
| Production worker | `node dist/worker.js`; development script `npm run worker` uses tsx |
| Type check | `npm run typecheck` -> `tsc --noEmit`; no separate lint script |
| Tests | `npm test` -> `tsx --test test/*.test.ts` |
| Schema validation | `npm run db:validate` -> `prisma validate` |
| Production migrations, future authorized operation only | `npm run db:deploy` -> `prisma migrate deploy` |
| Connectivity | `npm run db:check` -> `tsx scripts/check-database.ts` |
| Prisma config / schema | `prisma.config.ts`, `prisma/schema.prisma` |
| SQL migrations | `prisma/migrations/*/migration.sql` (15 directories) |
| Database adapter | `src/database/database.ts` |
| Environment validation | `src/config/env.ts` |

Commands above run **from `services/api`**, not the Flutter/repository root.
The existing Dockerfile installs dependencies before setting NODE_ENV=production;
build-time TypeScript and Prisma development dependencies are required. Do not
replace its install with `npm ci --omit=dev` before building. Prisma CLI is also
retained for the separate migration operation. Dependencies were already installed
locally; this audit did not reinstall or update them.

PostgreSQL is the only datasource. Prisma's generated client goes to
`src/generated/prisma`, is excluded from Git/Docker input, and is regenerated at
build time. `prisma.config.ts` has a credential-free localhost fallback to permit
generation/validation; production runtime validation requires DATABASE_URL and
the adapter uses that URL. The fallback is not a production database setting.
The adapter uses UTC, a five-connection pool and three-second connection/query/
statement timeouts. Validate these limits against actual Railway latency/load.

## Existing Railway configuration

| Setting | API | Worker |
| --- | --- | --- |
| Source | Existing Patient project repository | Same repository |
| Root Directory | `/services/api` | `/services/api` |
| Config file path | `/services/api/railway.json` | `/services/api/railway.worker.json` |
| Builder | Existing Dockerfile | Same Dockerfile |
| Dockerfile relative to service root | `Dockerfile` | `Dockerfile` |
| Start | `node dist/server.js` | `node dist/worker.js` |
| Health | `/api/v1/health/ready`, 60 seconds | No HTTP health endpoint |
| Restart | ON_FAILURE, maximum 3 retries | ON_FAILURE, maximum 3 retries |
| Public HTTP domain | API only | None needed |

`services/api/Dockerfile` uses `node:24-bookworm-slim`, installs OpenSSL/CA
certificates, builds the API, binds HOST=0.0.0.0 and runs as non-root `node`.
It does not run migrations. No Nixpacks config or Procfile is needed. The unrelated
`ops/Dockerfile.web` serves web artifacts, not this backend.

Railway's root directory does not automatically select a nested configuration
file; set the explicit config paths above. See the official
[monorepo instructions](https://docs.railway.com/deployments/monorepo).
The application reads Railway's injected PORT; EXPOSE 3000 is not a hardcoded
listener. See [health checks](https://docs.railway.com/deployments/healthchecks).

API and PostgreSQL are REQUIRED. A separate worker is REQUIRED for the existing
scheduled cleanup and notification behavior, although API health can pass without
it. Redis/BullMQ are NOT REQUIRED: neither is imported or a package dependency.
The queue/outbox and leases are PostgreSQL-backed. The worker runs every 30 seconds
and handles session/OTP/budget cleanup, commerce holds, membership transitions,
notification collection and eligible outbound/push delivery. It does not run a
separate AI job queue. A worker must use the same database as the API.

## Complete environment inventory

Names below come from `src/config/env.ts`, operator scripts and `.env.example`.
No secret values are included. "Conditional" means not required to start a
restricted API with the relevant feature disabled; it is required to enable that
feature. Development, staging and production need separate secrets/accounts/data.

### A. Required production configuration

| Names | Requirement |
| --- | --- |
| `APP_ENV`, `NODE_ENV` | Explicit production (or staging) application environment and production Node runtime |
| `DATABASE_URL` | Real PostgreSQL runtime connection; separate least-privilege runtime and migration identities |
| `SESSION_SECRET` | Private random value of at least 32 characters; backend only; OTP HMAC, not a client JWT secret |
| `ADMIN_SECURITY_MODE` | Must explicitly be disabled or totp; default development is rejected |
| `PORT`, `HOST` | Railway provides port; Docker/default host is 0.0.0.0; need not manually override |
| `CORS_ORIGINS` | Exact approved HTTPS origins when Admin/browser clients are used; empty is allowed for native-only access |
| `OTP_MODE`, `SMS_PROVIDER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `SMS_OTP_TEMPLATE` | Conditional: real OTP login requires provider mode, Twilio account/service/sender and approved template with one code placeholder |
| `ADMIN_TOTP_KEYS` | Conditional: per-existing-admin private keys required for totp mode; disabled mode blocks Admin APIs |

### B. Optional or feature-conditional production variables

| Names | Scope |
| --- | --- |
| `LOG_LEVEL` | Stdout log verbosity; choose info/warn, not debugging by default |
| `TRUSTED_PROXY_CIDRS` | Only verified ingress IPs/CIDRs; empty distrusts forwarding headers; never trust all proxies |
| `LEGAL_DOCUMENTS` | Reviewed, versioned HTTPS policy metadata; defaults empty, not legal approval |
| `ORDER_HOLD_MINUTES`, `ORDER_CANCEL_CONFIRMED`, `CANCELLATION_WINDOW_MINUTES`, `BOOKING_HOLD_MINUTES` | Existing bounded business policies; defaults exist |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | Resend adapter credentials and verified sender if enabled; queue/verified-recipient wiring remains incomplete |
| `PUSH_PROVIDER`, `FCM_SERVICE_ACCOUNT_JSON`, `NOTIFICATION_ENCRYPTION_KEY` | FCM credentials and separate encryption key when enabled; client/device acceptance remains external work |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Matching provider pair and independently strong webhook secret; do not enable production fulfillment merely by setting keys |
| `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY` | OpenAI only when explicitly enabled; not required for API startup |
| `AI_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS` | Bounded AI controls with defaults |
| `WHATSAPP_MODE`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Signed inbound webhook when enabled |
| `WHATSAPP_OUTBOUND`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_API_VERSION` | Explicit Cloud outbound configuration |
| `WHATSAPP_BUSINESS_ID` | Additional business-identity validation; currently optional in code, supply for production WhatsApp |
| `BACKUP_FILE`, `PG_DUMP_PATH` | Operator-only backup job, not API startup; default executable pg_dump must exist |

### C. Development-only features/settings

| Names | Production treatment |
| --- | --- |
| `DOCTOR_REGISTRATION_DEFER_DOCUMENTS` | Defaults false; true rejected in staging/production and production Node runtime |
| `DOCTOR_CREDENTIAL_STORAGE` | Only disabled or local-test exists; local-test rejected in deployed environments |
| `DOCTOR_CREDENTIAL_ROOT`, `DOCTOR_CREDENTIAL_KEY`, `DOCTOR_CREDENTIAL_SCANNER`, `DOCTOR_REQUIRED_CREDENTIALS` | Current private local-test adapter and review policy; setting these cannot create a production storage adapter |
| `DEMO_PROGRAMS`, `DEMO_CONSULTATIONS`, `DEMO_WELLNESS` | Must remain false; true rejected in deployments |
| `PAYMENT_MODE` | Must remain disabled in deployments; development settlement is rejected |

The development values of OTP_MODE, AI_PROVIDER and ADMIN_SECURITY_MODE are also
rejected in deployed environments. They are modes of the variables listed above,
not separate production bypass variables. PD_CREDENTIAL_ROOT is an internal
subprocess environment value for local-test ACL checks, not deployment config.

### D. Test-only

`AUTH_INTEGRATION` enables the PostgreSQL test suites alongside DATABASE_URL.
APP_ENV=test/NODE_ENV=test are local test settings. Test code creates random
synthetic accounts/secrets; none of those fixtures is a production account.

### E. Unused by this backend / reserved placeholders

`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
`VIDEO_PROVIDER_KEY`, `VIDEO_PROVIDER_SECRET` appear as placeholders in the root
example, but have no active production adapter/configuration consumer.
`API_BASE_URL` is client configuration, not a backend requirement. JWT_SECRET,
REDIS_URL, queue and Sentry configuration are not implemented runtime inputs;
do not provision them based on names from earlier product plans. FCM uses its
own service-account JWT internally; application authentication uses opaque
database-backed sessions.

The root example omits the newer Doctor registration settings. Use the actual
validated schema/inventory above as authority; do not copy development runtime
JSON into Railway.

## Database and migration safety

There are 15 SQL migration directories, including the currently untracked
`20260909100000_doctor_registration`. Migrations include constraints/triggers,
foreign-key replacements and the `btree_gist` extension used for overlapping
consultation exclusion. A historical migration preserves already verified real
doctors based on verifiedAt; migrations are not all simply CREATE TABLE scripts.
Review them against the destination state and verify extension privileges.

For a future authorized deployment: back up any existing target, use a separate
migration identity, run `npm run db:deploy` once, then validate runtime grants.
Never use db:migrate (migrate dev), db push, resets or development seeds in
production. Neither the Dockerfile nor Railway files currently execute migrations.
An approved migration job should run before API/worker rollout. Railway provides
[pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command),
but these inherit service variables; do not give the runtime database owner
credentials just to simplify migrations. No migration was executed in this audit.

## Authentication, registration and security

`src/modules/auth/identity-service.ts` uses random six-digit OTPs, HMAC hashes,
expiry, attempt/resend budgets and replay prevention. Sessions are random opaque
tokens with only their hash persisted. Verification loads current database roles
and account status. Admin endpoints require server authorization and deployed
TOTP elevation (or are disabled); Doctor endpoints require role and ownership,
with operational access requiring VERIFIED. Patient permissions remain server-side.

`context: DOCTOR` on the shared OTP endpoints selects DOCTOR_LOGIN. Unknown
numbers receive DOCTOR_REGISTRATION_REQUIRED, without creating USER or OTP rows.
`/api/v1/doctor/registration/otp/request` allows absent numbers and uses the
DOCTOR_REGISTRATION purpose. OTP verification creates a pending, non-operational
Doctor profile. Existing Patient-only registration remains intentionally denied;
the client cannot self-promote a role. The regression test is
`test/doctor-registration-entry.integration.test.ts`; duplicate recovery,
rejection/resubmission, suspension and authorized approval are covered there.

The entire deferred-document development journey can pass while **production
submission/approval remains blocked**: `configuredRegistration` currently supports
only disabled/local-test storage, and `RegistrationService.complete` requires
storage and document policy unless deferral is explicitly enabled. The production
flag checks correctly prevent using development deferral as a launch bypass.

CORS uses an exact origin allowlist and deployed HTTPS validation. Native Patient
and Doctor apps do not require browser CORS origins; Admin and optional Flutter
web do. No wildcard is accepted. Retained Doctor browser cookies use HttpOnly,
SameSite=Strict and Secure in deployed environments; mobile uses Bearer sessions.

Warning: verify Railway ingress addresses/header stripping before configuring
TRUSTED_PROXY_CIDRS. Otherwise users may share a proxy IP for in-memory limits.
Global/IP rate limits are process-local; sensitive authenticated budgets and
phone OTP budgets have database protection. Do not assume identical limits after
horizontal scaling. Actual Railway ingress/load behavior is not tested locally.

Logs go to stdout/stderr with request IDs, route patterns and safe error codes;
raw request bodies, URLs/query strings and credentials are not logged by the
configured request logger. Errors are sanitized. Metrics are Admin-protected and
per-process; no Sentry SDK/export or external alert delivery is configured.
Server startup pings the database, readiness returns 503 for unavailable DB, and
SIGTERM/SIGINT handlers close Fastify/Prisma (10-second API shutdown watchdog).
Linux container signal/worker shutdown acceptance still needs a container run.

Local disk writes in API source are confined to the development credential store
(private encrypted files and scanner quarantine); it is not a production provider.
The backup script writes a pg_dump archive to an operator destination. Do not put
that archive on ephemeral Railway application disk as the only backup. API Docker
does not install pg_dump. No active production upload/PDF/export/log-file store
was found; production private media and credential storage remain unavailable.

## Client URL configuration (read-only inspection)

- Patient: `apps/mobile/lib/core/config/app_config.dart`, AppConfig.fromEnvironment,
  compile-time API_BASE_URL, APP_ENV, SHOW_DEVELOPMENT_OTP. Local default is
  http://localhost:3000/api/v1. Release requires explicit staging/production and
  HTTPS. After deployment, rebuild with the approved HTTPS API URL ending /api/v1,
  production environment and development OTP display disabled.
- Separate Doctor project: `../Pocket Doctor Doctor/lib/main.dart` reads
  String.fromEnvironment('API_BASE_URL'); `lib/core/config/app_config.dart`
  validates the HTTPS /api/v1 URL. Supply the same deployed API URL through
  --dart-define=API_BASE_URL=... when building. No Doctor files were changed.
- Admin: VITE_API_BASE_URL points to the same HTTPS API prefix at build time;
  allow its actual web origin in CORS_ORIGINS. Vite/Flutter values are public and
  must never contain database, session, SMS or provider secrets.

## Launch blockers and acceptance boundary

1. Production Railway database/network/runtime secrets, approved web origins,
   migration identity/grants and ingress configuration are not validated here.
2. Working production SMS login requires approved Twilio sender/template and real
   delivery acceptance. Disabled OTP permits a health-only deployment, not login.
3. Production Doctor credential storage/review policy is unavailable. No provider
   was added and no document bypass was enabled.
4. Required registration code and its migration are currently uncommitted or
   untracked. A GitHub-based deploy must include the reviewed fixes; deploying the
   old commit would omit them.
5. Full product launch still has documented provider gaps: Razorpay fulfillment,
   recurring billing, WhatsApp assistant delivery, email routing/recipient
   verification, Flutter push integration, video and private media. These do not
   prevent a restricted API health deployment with those capabilities disabled.
6. External monitoring, backup retention/restore acceptance and real provider
   delivery are not established by a local build. No production readiness claim.

## Validation evidence

The initial sandboxed test invocation failed before test execution with spawn
EPERM. Its output is retained in `artifacts/railway-audit-backend-tests.txt`;
the authorized rerun is recorded separately. No assertions/tests were removed.

| Check performed in this audit | Result / evidence |
| --- | --- |
| Production backend build | PASS: `npm run build`, exit 0; Prisma generation and TypeScript emit completed |
| Prisma generation | PASS: Prisma Client 7.10.0 generated to src/generated/prisma |
| Static type check | PASS: `npm run typecheck`, exit 0 |
| Prisma schema | PASS: `npm run db:validate`, exit 0 |
| Existing backend suite | PASS: 162 passed, 0 failed, 0 cancelled, 0 skipped; 109446.3535 ms; `artifacts/railway-audit-backend-tests-authorized.txt` |
| Registration regression | PASS within the suite: new number, OTP, profile, deferred submission, pending restrictions, Admin approval, VERIFIED/READY and Doctor APIs; existing Patient policy and role isolation preserved |
| Database read-only check | PASS: SELECT 1; 15 applied migrations match all 15 on-disk checksums; btree_gist present |
| Compiled production-configured process | PASS: actual `node dist/server.js`, fresh temporary localhost port, production environment, random ephemeral session secret, real local test DB; health and readiness HTTP 200 |
| Production CORS / disabled OTP | PASS: exact allowed origin reflected, unrelated origin not reflected, disabled OTP HTTP 503 |
| Production guard checks | PASS: 10 unsafe overrides rejected with otherwise valid production configuration (OTP/payment/AI/admin development modes, three demo flags, document deferral/local storage, wildcard CORS) |
| Runtime evidence | `artifacts/railway-audit-runtime.mjs` and `artifacts/railway-audit-runtime-results.json`; temporary server stopped after checks |
| Secret hygiene spot check | PASS within scope: zero high-confidence private-key/provider-key/embedded-database-credential pattern matches in API source/scripts; private runtime/artifact files are Git-ignored; tracked env files are examples, not runtime secrets. This is not an exhaustive Git-history secret audit. |
| Whitespace validation | PASS: `git diff --check`; existing line-ending conversion notices only |
| Dependency install | NOT RUN: dependencies already present; Docker's locked `npm ci` inspected |
| Linux Docker image / container signals | NOT TESTED: Docker CLI unavailable; local Node build/start does not establish image acceptance |
| Railway / production DB / real SMS | NOT TESTED: no deployment or external provider calls made |
| Patient / Doctor / Admin builds and physical devices | NOT RUN: no client code changes in this audit |

The authorized npm test process exited 0. PowerShell also rendered an npm version
update notice as NativeCommandError text after the successful summary; this was
not a test failure and no dependency was updated.

Only this audit document was added to source control's working tree by this task.
Audit helpers/logs are ignored artifacts. Existing backend, schema, migration,
Admin and registration changes predate this audit and were not modified here.

## Next deployment steps (not executed)

1. Review/commit the existing registration changes and migration with this audit;
   verify the GitHub source revision contains all required files and no secrets.
2. Resolve the feature blockers for the intended release scope. Obtain independent
   staging/production credentials and approve least-privilege grants/backups.
3. When deployment is explicitly authorized, configure API, PostgreSQL and worker
   services using the existing root/config paths above. Redis is unnecessary.
4. Populate validated environment settings; keep development/demo flags disabled.
   Keep unfinished providers disabled. Provision Admin TOTP out of band or leave
   Admin disabled. Configure exact HTTPS CORS origins and verified proxy trust.
5. Review destination migration status and backup, execute the separately approved
   migration command once with its migration identity, and verify runtime grants.
6. Build the existing Dockerfile, start API/worker, verify injected PORT/readiness,
   public HTTPS, ingress/rate limits, worker heartbeat and safe failure behavior.
7. Once the real API URL exists, rebuild Patient, Doctor and Admin clients against
   that same /api/v1 URL. Validate real SMS, registration/document policy and
   authorization on staging before any production launch decision.
