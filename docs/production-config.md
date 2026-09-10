# Production configuration inventory

## Railway startup configuration errors

The API now prints `Invalid environment configuration: VARIABLE_NAME, ...` for
validation failures. Only variable names are logged; supplied values and generic
exception details remain hidden. Older builds replace this with the less useful
`Startup failed; check environment configuration.` Redeploy the diagnostic change
if the failed variable names are needed. The generic message alone cannot prove
which deployed setting is wrong.

For an initial deployment with external providers not yet configured, use
APP_ENV=production, NODE_ENV=production and ADMIN_SECURITY_MODE=disabled.
Supply DATABASE_URL through the Railway PostgreSQL service reference and a private,
random SESSION_SECRET of at least 32 characters. Do not use a localhost database
URL, sample credentials or a literal placeholder. HOST should be 0.0.0.0 and PORT
should use Railway's provided port.

Keep OTP_MODE, PAYMENT_MODE, AI_PROVIDER, EMAIL_PROVIDER, PUSH_PROVIDER,
WHATSAPP_MODE and WHATSAPP_OUTBOUND disabled until their integrations are ready.
Keep DEMO_PROGRAMS, DEMO_CONSULTATIONS, DEMO_WELLNESS and
DOCTOR_REGISTRATION_DEFER_DOCUMENTS false, and DOCTOR_CREDENTIAL_STORAGE disabled.
Remove unused sample provider credentials rather than submitting placeholder
values to validators. CORS_ORIGINS may be empty until approved browser origins
exist; configured production origins must be exact HTTPS origins.

This restricted setup can serve health checks; disabled OTP and Admin modes do
not provide login or Admin access. Existing validated integrations should retain
their properly configured provider settings. Doctor document submission remains
blocked until a production private-storage adapter and review policy exist.

After configuration passes, check /api/v1/health/ready for database connectivity.
Migrations remain a separate reviewed operation; no startup reset is performed.

Local diagnostic-change validation (2026-09-10): build and type-check passed.
The first concurrent suite reached 116 tests: 104 passed, 12 failed, none skipped;
failures included database query timeouts and local storage subprocess failures
(`artifacts/railway-startup-tests.txt`). After compilation finished, the unchanged
suite run with `--test-concurrency=1` passed all 164 tests, none failed or skipped
(`artifacts/railway-startup-tests-serial.txt`). New startup tests verify safe field
names and the actual API process exit. Railway variables/deployment have not been
validated by this local change.

P7-A additions and current limitations are documented in
[provider configuration](provider-configuration.md) and the
[P7-A closure evidence](p7-a-provider-closure.md). Optional Twilio SMS, Resend
email and FCM push adapters are disabled by default. No real provider delivery or
sandbox payment has been validated. `OTP_MODE=provider` now supports the existing
identity flow when an approved SMS sender is explicitly configured. The Doctor
Portal web app has been removed; its backend session contract is retained but
there is no doctor web build or deployment target.

No real credentials belong in this document, source control, Flutter defines,
portal Vite variables, screenshots or logs. `.env.example` is a reference;
deployment secrets must come from the platform secret store. Development,
staging and production must use separate databases, secrets, provider accounts
and URLs. Production is currently blocked; this is a configuration inventory.

`services/api/config/legal-documents.example.json` lists all nine required legal
document slots with `approved=false` and deliberately invalid example URLs.
It is a metadata template, not a set of legal documents. Replace values only
after review; serialize reviewed metadata into `LEGAL_DOCUMENTS`.

| Variable | Owner / requirement |
| --- | --- |
| `APP_ENV`, `NODE_ENV` | Backend: explicit `staging`/`production` and `production` runtime |
| `DATABASE_URL` | Private PostgreSQL connection for a least-privilege runtime login; migration owner kept separate |
| `SESSION_SECRET` | Random backend-only secret, at least 32 characters; rotate with a documented session/OTP invalidation procedure |
| `HOST`, `PORT`, `LOG_LEVEL` | Platform service binding, injected port, production info/warn logging |
| `CORS_ORIGINS` | Exact approved HTTPS user-web and admin origins; no wildcard; remove retired portal origins |
| `TRUSTED_PROXY_CIDRS` | Only verified ingress IPs/CIDRs; empty distrusts forwarding headers. `/0` and `true` are rejected. Validate forwarding-header stripping at the actual ingress. |
| `OTP_MODE` | `disabled` until sender acceptance, or `provider` with the approved Twilio configuration documented in provider-configuration.md; development is rejected in deployments |
| `ADMIN_SECURITY_MODE` | `totp` after provisioning/testing, or `disabled`; development is rejected in deployments |
| `ADMIN_TOTP_KEYS` | Secret JSON mapping existing admin UUIDs to separate base32 keys; provision out of band; no shared/default key |
| `LEGAL_DOCUMENTS` | Versioned HTTPS document metadata with explicit approved flags after business/legal review |
| `PAYMENT_MODE` | `disabled` in deployments; existing development settlement is forbidden |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Matching backend key pair; distinguish test and live accounts; not sufficient to enable unwired live checkout |
| `RAZORPAY_WEBHOOK_SECRET` | Independently generated strong webhook secret, at least 32 characters; configure exact callback URL and event subscription |
| `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY` | `disabled` or configured provider after safety/privacy acceptance; development prohibited in deployments |
| `AI_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS` | Bounded server-side runtime settings; never client-controlled |
| `WHATSAPP_MODE` | `disabled` or signed `webhook` |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Approved Meta business app/number credentials; use separate staging/production identities |
| `WHATSAPP_OUTBOUND`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_API_VERSION` | `disabled` or explicitly configured `cloud`; use a provider-supported approved API version; notification delivery only |
| `DEMO_PROGRAMS`, `DEMO_CONSULTATIONS`, `DEMO_WELLNESS` | All `false` in deployments; rejected otherwise |
| `ORDER_HOLD_MINUTES`, `ORDER_CANCEL_CONFIRMED`, `BOOKING_HOLD_MINUTES`, `CANCELLATION_WINDOW_MINUTES` | Business-approved transaction policies, validated bounded values |
| `BACKUP_FILE`, `PG_DUMP_PATH` | Operator backup job only; new destination, matching PostgreSQL utilities, encrypted off-host storage outside the application |
| Cloudinary/video/shipping settings | Reserved until adapters and access-control acceptance are completed; merely setting placeholders enables nothing |

## Clients and release secrets

Flutter uses `--dart-define-from-file=config/production.json`; the ignored private
file must contain only `APP_ENV`, `API_BASE_URL`, `SHOW_DEVELOPMENT_OTP=false`.
`config/production.example.json` intentionally targets `api.example.invalid` and
validates compilation only. Release startup refuses development environment or
development OTP. Never put payment, AI, database, session or provider secrets in
client configuration.

The Admin Console requires `VITE_API_BASE_URL=https://<approved-api>/api/v1` for the
production build/runtime; admin
development OTP display is confined to local development. Vite values are public.

Android release signing reads `PD_KEYSTORE_FILE`, `PD_KEYSTORE_PASSWORD`,
`PD_KEY_ALIAS`, `PD_KEY_PASSWORD` from the private build environment. All four
must be supplied together. There is no debug-key fallback for release. Keystores,
provisioning profiles and production define files are ignored. Confirm the
provisional app identifier and supply the approved logo/icons before submission.
iOS requires macOS/Xcode, owned bundle/team IDs and private signing profiles.

## Deployment services

Deploy separately: API, worker, PostgreSQL, customer web if required, and Admin
Console. API/worker use `services/api/Dockerfile` and distinct
Railway service definitions. Migration execution is deliberately separate from
application rollout. Verify database backups and review each additive migration
first. Do not deploy using a database owner/superuser.

Prebuilt web artifacts can use `ops/Dockerfile.web`, `BUILD_DIRECTORY`,
`API_PUBLIC_ORIGIN` and the platform `PORT`. `ops/serve-web.mjs` supplies SPA
fallback, MIME types, no-store HTML, CSP/security headers and a health endpoint.
Put it behind verified HTTPS ingress; it does not issue certificates. Test CSP
with the final program-media/consultation provider allowlist before enabling
those providers. The default policy intentionally does not allow arbitrary
iframes or external media execution.

The API readiness endpoint confirms database availability, not provider/medical/
legal readiness. External provider status in the admin dashboard is descriptive
configuration, not evidence of successful live delivery.
