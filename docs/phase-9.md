# Phase 9 — Railway deployment preparation

Audit date: 2026-09-14. This is a repository release audit, not a deployment or
production launch. The working hosted Patient testing configuration is preserved.
No production variables, data, migrations, provider integrations or business
logic were changed. Local regression tests create and clean synthetic test data.

## Release inventory

Starting branch: `main`, HEAD `111ee7f`. Nothing was staged or untracked initially.
The 35 modified files were the previously requested Patient launcher icon assets,
their generator and documentation. They remain outside the Phase 9 commit.

| Category | Inventory / handling |
| --- | --- |
| A. Required application changes | Doctor registration/auth fix `8216243` and hosted Patient OTP isolation `91d2403` already committed; preserve both. No runtime application edits required here. |
| B. Deployment | Existing API/worker Railway JSON, Dockerfile and service `.dockerignore` retained. Add read-only `npm run db:audit`; run it in CI after migrations on the disposable test database. |
| C. Tests | Add compiled API, worker one-shot, worker recurring-cycle and migration-history regression tests. Existing assertions remain intact. |
| D. Documentation | This inventory, environment matrix and controlled release procedure; links from configuration/runbook. |
| E. Temporary/local | `artifacts/phase9-*`, local database/tooling and validation logs are ignored. |
| F. Generated | `node_modules`, `dist`, generated Prisma client, Flutter caches/builds/APKs remain ignored. Native launcher icons are intentionally tracked app assets, but unrelated to this commit. |
| G. Sensitive | Local `.env`, runtime JSON, database files, dumps and signing material excluded; only `.env.example` files tracked. Source scan reports patterns/paths only, not secret values. |

Other relevant commits: `11c8fb8` adds safe environment diagnostics; `c1dd2c5`
serializes shared-database tests. No resets, reversions or automatic push performed.

## Railway service settings

| Setting | API | Worker |
| --- | --- | --- |
| Repository | Existing Patient repository | Same repository |
| Root Directory | `/services/api` | `/services/api` |
| Config File Path | `/services/api/railway.json` | `/services/api/railway.worker.json` |
| Dockerfile | `Dockerfile` relative to service root | Same Dockerfile/image recipe |
| Install / build | `npm ci`, then `npm run build` in Dockerfile | Same build compiles both entry points |
| Start | `node dist/server.js` (also `npm start`) | `node dist/worker.js` |
| Deploy readiness | `/api/v1/health/ready`, timeout 60s | No HTTP endpoint/public domain |
| Liveness | `/api/v1/health` | Observe `worker_cycle` logs |
| Restart | ON_FAILURE, maximum 3 retries | ON_FAILURE, maximum 3 retries |
| Automatic migrations | None | None |

Railway config paths are repository-absolute even when a Root Directory is set.
See [Railway monorepo documentation](https://docs.railway.com/deployments/monorepo).
Do not deploy the repository root or use the root `.dockerignore` as the API
context: that ignore file is for the separate static-web image only.

The image is Node 24/bookworm-slim with OpenSSL/CA certificates, locked npm
dependencies, generated Prisma client and compiled ESM. It runs as non-root
`node`; Prisma/TypeScript tooling remains available for operator commands.
The image tag follows Node 24 security updates and is not an immutable digest;
record the successful deployed image digest for rollback.
`EXPOSE 3000` is metadata: the API actually reads Railway's `PORT` and binds to
`HOST=0.0.0.0`. The worker does not open a port. Redis/BullMQ are not dependencies.

The database adapter uses UTC, maximum five connections per process and bounded
3-second connection/query/statement timeouts. Account for API + worker pools when
setting PostgreSQL capacity. API shutdown calls Fastify close and disconnects
Prisma with a 10-second deadline. Worker shutdown aborts the between-cycle wait,
finishes its current work and closes Prisma. Active cycles can contain multiple
bounded calls: validate Railway SIGTERM drain time before rollout. Windows
process termination does not prove Linux graceful shutdown.

## Environment matrix

Only names appear below. Required means explicit deployment configuration;
conditional means required only when enabling that capability. Both entry points
use the same validator: a provider mode enabled on the worker also requires its
complete credentials, even when the API is its primary consumer. Leave unused
worker provider modes disabled; never copy local runtime JSON into Railway.

| Variable | Required | Service | Notes |
| --- | --- | --- | --- |
| `APP_ENV` | REQUIRED | BOTH | Separate staging and production environments. |
| `NODE_ENV` | REQUIRED | BOTH | Production Node runtime for deployed services. |
| `DATABASE_URL` | REQUIRED | BOTH | Same environment/database; private runtime credentials, not migration owner. |
| `SESSION_SECRET` | REQUIRED | BOTH | Backend-only random secret, minimum 32 characters; shared validator. |
| `ADMIN_SECURITY_MODE` | REQUIRED | BOTH | Explicit disabled or provisioned TOTP; development forbidden. |
| `HOST` | OPTIONAL | API | Docker default binds all interfaces. |
| `PORT` | REQUIRED, platform supplied | API | Use Railway injection; worker does not listen. |
| `LOG_LEVEL` | OPTIONAL | API | Production stdout/stderr logging; worker emits minimal JSON events. |
| `CORS_ORIGINS` | CONDITIONAL | API | Exact HTTPS browser origins; empty allowed for native-only access. |
| `TRUSTED_PROXY_CIDRS` | CONDITIONAL | API | Only verified ingress proxies; affects client-IP rate limiting. |
| `OTP_MODE` | REQUIRED for login | API | Preserve testing in isolated staging; production disabled/provider only. |
| `SMS_PROVIDER` | CONDITIONAL | API | Existing SMS adapter, no new integration in this phase. |
| `TWILIO_ACCOUNT_SID` | CONDITIONAL | API | Required for provider OTP. |
| `TWILIO_AUTH_TOKEN` | CONDITIONAL | API | Private provider credential. |
| `TWILIO_MESSAGING_SERVICE_SID` | CONDITIONAL | API | Approved sender service. |
| `SMS_OTP_TEMPLATE` | CONDITIONAL | API | Approved template with one code placeholder. |
| `ADMIN_TOTP_KEYS` | CONDITIONAL | API | Existing Admin UUID-to-secret mapping for TOTP mode. |
| `LEGAL_DOCUMENTS` | OPTIONAL | API | Approved/versioned policy metadata; no legal approval inferred. |
| `PAYMENT_MODE` | OPTIONAL | BOTH | Development settlement remains forbidden in deployments. |
| `DEMO_PROGRAMS` | OPTIONAL | API | Must remain off in deployments. |
| `DEMO_CONSULTATIONS` | OPTIONAL | API | Must remain off in deployments. |
| `DEMO_WELLNESS` | OPTIONAL | BOTH | Must remain off in deployments. |
| `ORDER_HOLD_MINUTES` | OPTIONAL | API | Existing reservation policy default. |
| `ORDER_CANCEL_CONFIRMED` | OPTIONAL | API | Existing cancellation policy default. |
| `CANCELLATION_WINDOW_MINUTES` | OPTIONAL | API | Existing consultation policy default. |
| `BOOKING_HOLD_MINUTES` | OPTIONAL | API | Existing consultation policy default. |
| `RAZORPAY_KEY_ID` | CONDITIONAL | API | Existing payment/refund adapter. |
| `RAZORPAY_KEY_SECRET` | CONDITIONAL | API | Private provider credential; not enough to enable live checkout. |
| `RAZORPAY_WEBHOOK_SECRET` | CONDITIONAL | API | Independent signature-verification secret. |
| `AI_PROVIDER` | OPTIONAL | API | Disabled unless explicitly configured. |
| `AI_MODEL` | CONDITIONAL | API | Required for OpenAI mode. |
| `AI_API_KEY` | CONDITIONAL | API | Backend-only OpenAI credential. |
| `AI_TIMEOUT_MS` | OPTIONAL | API | Existing bounded timeout. |
| `AI_MAX_OUTPUT_TOKENS` | OPTIONAL | API | Existing output limit. |
| `EMAIL_PROVIDER` | OPTIONAL | BOTH | Existing adapter; worker email routing still not enabled. |
| `RESEND_API_KEY` | CONDITIONAL | BOTH | Required if email mode enabled; no delivery claimed. |
| `EMAIL_FROM` | CONDITIONAL | BOTH | Verified sender if email enabled. |
| `PUSH_PROVIDER` | OPTIONAL | BOTH | Existing FCM adapter; disabled without acceptance. |
| `FCM_SERVICE_ACCOUNT_JSON` | CONDITIONAL | BOTH | Private service account when push enabled. |
| `NOTIFICATION_ENCRYPTION_KEY` | CONDITIONAL | BOTH | Encrypts device tokens; preserve across API/worker. |
| `WHATSAPP_MODE` | OPTIONAL | BOTH | API signature validation; shared outbound prerequisites. |
| `WHATSAPP_OUTBOUND` | OPTIONAL | WORKER | Existing Cloud delivery mode. |
| `WHATSAPP_ACCESS_TOKEN` | CONDITIONAL | WORKER | Private delivery credential. |
| `WHATSAPP_API_VERSION` | CONDITIONAL | WORKER | Approved version for outbound calls. |
| `WHATSAPP_APP_SECRET` | CONDITIONAL | API | Inbound signature secret; shared validation when outbound enabled. |
| `WHATSAPP_VERIFY_TOKEN` | CONDITIONAL | API | Webhook verification; shared validation. |
| `WHATSAPP_PHONE_NUMBER_ID` | CONDITIONAL | BOTH | Matches inbound/outbound account. |
| `WHATSAPP_BUSINESS_ID` | OPTIONAL | API | Additional inbound business-identity check. |
| `DOCTOR_REGISTRATION_DEFER_DOCUMENTS` | OPTIONAL | API | Development/test only; deployed true rejected. |
| `DOCTOR_CREDENTIAL_STORAGE` | OPTIONAL | API | Disabled in deployment; local-test forbidden. |
| `DOCTOR_CREDENTIAL_ROOT` | CONDITIONAL, local only | API | Private local-test storage path; never Railway persistence. |
| `DOCTOR_CREDENTIAL_KEY` | CONDITIONAL, local only | API | Private local-test encryption key. |
| `DOCTOR_CREDENTIAL_SCANNER` | CONDITIONAL, local only | API | Local-test scanner command. |
| `DOCTOR_REQUIRED_CREDENTIALS` | OPTIONAL | API | Existing credential review policy; no new fields. |
| `AUTH_INTEGRATION` | TEST ONLY | Neither runtime | Enables integration suites on a disposable test DB. |
| `BACKUP_FILE`, `PG_DUMP_PATH` | CONDITIONAL, operator only | Neither runtime | Backup destination/tool; avoid ephemeral storage for retained backups. |

`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
`VIDEO_PROVIDER_KEY`, `VIDEO_PROVIDER_SECRET` are unused placeholders, not
implemented production storage/video adapters. `API_BASE_URL` is Flutter config,
not a backend input. No runtime Redis, BullMQ, Sentry or JWT-secret configuration
exists. Application sessions are opaque and database-backed.

## Testing versus production

The working staging setup stays `APP_ENV=staging`, `NODE_ENV=production`,
`OTP_MODE=testing`, `ADMIN_SECURITY_MODE=disabled`. Its database must contain only
dummy data. Preview OTP does not establish phone ownership. Backend checks limit
it to active Patient USER accounts and recheck roles at verification/session
restoration. Doctor/Admin/mixed-role accounts cannot use it; client role/context
input cannot elevate access. Production rejects testing OTP, and testing hashes
cannot be used after switching to provider mode.

Doctor login/registration retain their existing local-development/provider-mode
behavior. Unknown Doctor sign-in does not create a Patient. Registration OTP can
create a pending applicant; operations remain blocked until authorized approval.
Development document deferral stays unavailable on Railway staging/production.
Provider SMS and private credential storage remain external launch dependencies;
this phase does not activate them.

## Controlled database and release procedure

1. Select the reviewed commit, preserve the existing staging variables and verify
   separate production secrets/data. Configure both explicit Railway config paths.
2. Build/test the actual Docker image in a Docker-capable environment. Verify
   runtime-role grants and graceful SIGTERM for API and worker on Linux; confirm
   private networking, TLS, ingress forwarding and restart/alert behavior.
3. Using the migration/audit identity, run `npm run db:audit` against the intended
   database. This SELECT-only command checks applied count, every SHA-256 file
   checksum and unfinished migrations, returning exit 1 for mismatches. It prints
   counts only. Do not grant migration-table access to the runtime user for this.
4. If reviewed new migrations exist, take and validate a backup; execute
   `npm run db:deploy` once through an explicitly authorized migration operation
   in Railway's private network. Use the same release image and migration-owner
   identity. Never reset, use production db push, or run migrations in both API
   and worker startup. Re-run `db:audit` and review runtime grants afterward.
5. Deploy API and worker only after approval. Check health/readiness and worker
   cycles; verify one controlled staging Patient journey without logging OTPs or
   tokens. Record the immutable release artifact and keep a compatible rollback.

A permanent migration service is not required. A controlled one-shot operation
is sufficient; an API-only pre-deploy command is an alternative only after the
operator explicitly approves automatic migrations and its credentials/timeout.
No pre-deploy migration is enabled by this commit. Railway runs pre-deploy work
in a separate container; see [pre-deploy documentation](https://docs.railway.com/deployments/pre-deploy-command).

Readiness checks database connectivity, not migration correctness, worker health
or external-provider readiness. Railway's deployment healthcheck does not replace
ongoing monitoring; see [healthcheck documentation](https://docs.railway.com/deployments/healthchecks).
Monitor API errors/readiness and worker `worker_cycle_failed`, missing cycles and
backlog age. Worker cycles run every 30 seconds after the preceding cycle finishes.
No monitoring provider is introduced here.

Native Patient/Doctor Flutter clients do not need CORS origins. For browser Admin
or Flutter web, list the actual browser UI origins, not merely the API hostname.
The API Railway domain and a future custom API domain belong in client base URLs,
each ending in `/api/v1`; a domain change does not justify wildcard CORS. Keep
approved UI origins exact and HTTPS; verify proxy forwarding before trusting it.

Runtime local disk use is confined to the disabled development credential adapter.
Backups/exports are operator concerns; do not retain sensitive files on Railway's
ephemeral filesystem. stdout/stderr logs omit bodies, phone numbers and credentials.

## Validation evidence

Verdict: **PARTIAL**. Local validation passed; Docker and live infrastructure
acceptance remain unverified. This release was not deployed or pushed.

| Check | Result | Evidence |
| --- | --- | --- |
| Locked install | PASS, 207 packages, 0 reported vulnerabilities | `artifacts/phase9-install.log`; Node 24.11.1 / npm 11.6.2 |
| Production build / Prisma generate | PASS, Prisma 7.10.0 | `artifacts/phase9-build.log` |
| Type-check | PASS | `artifacts/phase9-typecheck.log`; the new test harness's initial inferred-type errors were corrected before final validation |
| Prisma schema | PASS | `artifacts/phase9-prisma.log` |
| Local DB connectivity | PASS under production-like environment | `artifacts/phase9-database-check.log` |
| Local migrations | PASS: 15 files, 15 applied, 15 checksum matches, 0 unfinished | `artifacts/phase9-migration-audit.log`; no migration executed |
| Full backend suite | 176 passed / 0 failed / 0 skipped | `artifacts/phase9-backend-tests.log`; includes 4 new deployment tests |
| Doctor regression subset | 38 passed / 0 failed / 0 skipped, included in 176 | Entry/approval (16), registration (14), session (8) tests |
| Admin client | 16 passed / 0 failed / 0 skipped | `artifacts/phase9-admin-tests.log`; server approval/MFA also covered by backend suite |
| Patient analyze | PASS, no issues | `artifacts/phase9-patient-analyze.log` |
| Patient tests | 91 passed / 0 failed / 5 skipped | `artifacts/phase9-patient-tests.log`; real local auth and health smoke enabled |
| Compiled production API | PASS: injected port, HTTP health/readiness 200, CORS, unauthenticated 401, disabled OTP 503 | `test/deployment.integration.test.ts`, executed in full suite |
| Compiled production worker | PASS: successful one-shot, two recurring cycles, termination | Same test; POSIX graceful termination assertion runs only on Linux, not validated here |
| Existing Railway API | Health HTTP 200; readiness HTTP 200 | Read-only HTTPS probes on 2026-09-14; no live OTP/user write attempted |
| Source scan / diff whitespace | PASS, 319 source/config/document files scanned; no credential-pattern findings | `node ops/scan-secrets.mjs`, `git diff --check`; not a full history or external secret-store audit |
| Docker | BLOCKED — unavailable locally | No Docker executable/install found; no image-build claim |
| Railway migration checksums / runtime grants / worker | NOT VERIFIED | No authenticated Railway configuration/database access available |

Patient command, from `apps/mobile` after starting an isolated local development
API using the test database:

```sh
flutter analyze --no-pub
flutter test --no-pub --concurrency=1 --reporter expanded --dart-define=API_BASE_URL=http://127.0.0.1:3209/api/v1 --dart-define=RUN_API_SMOKE=true --dart-define=RUN_AUTH_SMOKE=true
```

The five skipped cases are program, consultation, commerce, assistant and
membership real-API smoke journeys, which require their separate demo seeds.
Their existing unit/widget tests and backend integration suites still ran.
The real Patient auth smoke verifies backend OTP, profile save, session restore,
authenticated API access and logout. No physical-device acceptance is claimed.

Backend command: from `services/api`, run `npm run build`, `npm run typecheck`,
`npm run db:validate`, `npm run db:audit`, `npm test` with `AUTH_INTEGRATION=true`
and the isolated loopback test database. Process-level tests require compiled
`dist` files and deliberately reject non-loopback/non-test database URLs.
No separate lint script is configured. Existing pg driver concurrent-query
deprecation warnings remain visible; no dependency major upgrade was performed.

Logs remain under ignored `artifacts/phase9-*`. Destructive database operations:
**NONE**. Pending production verification: actual Docker image and Linux drain,
remote migration checksums, least-privilege grants, backups/TLS/ingress and worker
deployment/monitoring. Real-user OTP needs a validated provider, outside this
phase. Readiness alone does not establish any of those conditions.
