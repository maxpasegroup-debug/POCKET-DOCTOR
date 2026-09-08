# P7-A: external provider closure evidence

Historical evidence: the Doctor Portal web app was subsequently removed at the
user's request. Its build/browser results and file inventory below describe the
earlier P7-A validation, not a currently available client. Backend doctor APIs
remain; portal CI/deployment targets and its standalone setup guide were removed.

Decision: **P7-A INCOMPLETE**. Local checks below pass; launch still has both
engineering gaps and external dependencies. No provider sandbox or production
account was exercised. No real delivery, debit, video room, deployment or iOS
validation is claimed. This report supersedes earlier Phase 7 statements only
for the changed areas below; P7-B has not started.

## Scope inspected

Read the Phase 7 pre-audit, validation, security audit, production configuration
and runbook. Retained Fastify/Prisma/PostgreSQL, the original OTP/session service,
shared payment ledger, raw signed webhook inbox and PostgreSQL notification
outboxes. No Redis/BullMQ infrastructure exists to replace or duplicate. Flutter
Riverpod/GoRouter/API architecture remains unchanged. The existing Git worktree
also contains earlier UI changes; those were preserved. No commit was created.

## Changes and security boundaries

- Doctor login: reuse the original OTP and opaque Session. Exchange its bearer
  for a scoped HttpOnly cookie, restore the assigned profile on reload, and revoke
  the same server session on logout. DOCTOR role, verification and ownership are
  server checks. Missing/incomplete and pending profiles have clear screens;
  normal users see access denied plus a customer-app link. Cookies cannot access
  admin APIs. The standalone doctor sign-in guide was removed with the web app.
- SMS: optional Twilio Messages transport, disabled by default, approved template
  configuration, eight-second timeout and bounded responses. A challenge is
  unusable until provider acceptance. Failures return a temporary error without
  exposing its code; expiry, HMAC, attempt limits, cooldown, replay protection and
  roles remain in the existing identity service. No blind send retry.
- Email: optional Resend transport with fixed non-sensitive text, stable event
  idempotency key, timeout and safe failure result. There is no arbitrary-recipient
  endpoint. Verified recipient collection, consent binding and queue delivery are
  unfinished; this is not an operational email channel.
- Push: optional FCM HTTP v1 transport with short-lived service-account OAuth;
  encrypted, session-bound device tokens; authenticated registration/refresh/
  removal; consent; logout cascade; bounded PostgreSQL worker claims/retries;
  invalid-token removal; uncertain sends quarantined. Previews contain only a
  generic account update. Client Firebase registration/permission/token-refresh
  integration and real-device acceptance remain unfinished.
- Database: additive `20260909070000_provider_push` migration adds PushDevice and
  a notification reference. Connections explicitly use UTC. Testing exposed that
  host-local PostgreSQL sessions interpreted Prisma timestamps 5h30m apart from
  SQL `now()`, incorrectly excluding fresh notifications and sessions. New records
  now pass worker eligibility tests. Existing non-UTC history requires a targeted
  audit, not a blind timestamp rewrite.
- Video: existing unavailable provider remains unavailable. New server access
  boundary permits only the booked patient or assigned verified doctor, within
  the confirmed/in-progress appointment window and with verified payment when
  required. Provider credentials may live no longer than five minutes or the
  appointment end. No real room or video provider is invented.
- Webhooks/payments: strengthen Razorpay callback/resource identifier validation
  and WhatsApp business/phone/event boundaries. Existing amount/order/currency/
  capture verification, durable event inbox, refund reconciliation and replay
  controls remain. A signed payment event alone does not grant business access.

## Provider matrix

Technical PASS means the named local component passed tests, not that the whole
provider or delivery channel is production ready.

| Provider | Technical status | External dependency | Validation |
| --- | --- | --- | --- |
| Razorpay | PASS adapter/inbox/refund tests; BLOCKED checkout and captured-event fulfilment wiring | CONFIGURATION REQUIRED: approved test/live account, keys, webhooks and settlement acceptance | PASS injected transport/DB; actual sandbox/live NOT TESTED |
| SMS | PASS configured transport plus original identity lifecycle | BLOCKED: chosen/approved sender, template and account credentials | PASS injected transport/DB; actual SMS NOT TESTED |
| WhatsApp | PASS signature/link/isolation/generic notification adapter; BLOCKED assistant response delivery | BLOCKED: Meta business/number approval, access/app/verify tokens and callback registration | PASS local signed callbacks; actual delivery NOT TESTED |
| Email | PASS adapter; BLOCKED verified recipients and queue routing | CONFIGURATION REQUIRED: provider choice, verified sender domain, key and contact consent | PASS transport/template tests; actual delivery NOT TESTED |
| Push | PASS backend device lifecycle/worker/FCM transport; BLOCKED Flutter Firebase integration | CONFIGURATION REQUIRED: Firebase app/project, service identity, platform files, APNs and device acceptance | PASS adapter/DB tests; actual push NOT TESTED |
| Video | PASS server participant/time/payment boundary; BLOCKED real adapter | BLOCKED pending provider/account selection | PASS local authorization tests; actual call NOT TESTED |
| Storage | BLOCKED secure uploads and signed private media adapter | CONFIGURATION REQUIRED: storage account, private access/retention policy and credentials | NOT TESTED against a provider |
| Monitoring | PASS existing local request metrics and worker evidence; external monitoring BLOCKED | CONFIGURATION REQUIRED: destination, retention, alert/on-call ownership | PASS local operations tests; external alerts NOT TESTED |

## Payment and membership acceptance

Local tests cover captured-payment verification, failed/unknown payment, wrong
amount/order/currency, invalid signatures, duplicate/conflicting webhook IDs,
refund intent/confirmation and ambiguous refund outcomes without repeated POSTs.
The event inbox records reconciliation-required status, not automatic fulfilment.
Customer checkout and captured-event domain fulfilment are still unwired.

Recurring membership subscription creation, activation, charging, renewal,
cancellation and grace-period provider reconciliation are **BLOCKED**. Merely
accepting a subscription webhook type is not a recurring billing implementation.
Manual renewal remains available under existing rules; no mandates or automatic
debits are enabled. Local membership lifecycle tests pass; provider recurring
acceptance is **NOT TESTED**.

## Retry and privacy acceptance

All implemented external HTTP transports have bounded deadlines; Razorpay,
Twilio, Resend, WhatsApp and each FCM/OAuth request use eight seconds, following
the existing provider convention. AI retains its bounded configured timeout.
New adapters cap parsed responses at 64 KiB and reject redirects. Money-moving
POSTs are not retried blindly. FCM has no assumed exactly-once guarantee: an
ambiguous send is UNKNOWN and requires review, not automatic resend. Worker
source keys, row claims and persisted outcomes prevent duplicate accepted jobs.
Resend's provider idempotency window is 24 hours, so future worker state must
outlive that window. See [provider contracts](provider-configuration.md#provider-contract-references).

Provider credentials remain backend-only. New optional adapters default to
disabled. Push tokens are encrypted; logout removes session-bound registrations;
global communication settings and per-device opt-in are rechecked before send.
No detailed health information is included in notification previews or provider
error messages. WhatsApp linkage and records remain user-scoped. No medical
decision-making or additional health collection was introduced.

## Reproducible validation

Tests used the isolated PostgreSQL database on loopback port 55434 and API 3008,
explicit development/demo modes and existing clearly labelled fixtures. Runtime
credentials were kept in ignored local files, never documentation. Provider
transport tests inject synthetic responses; they do not contact real providers.

| Check | Result | Evidence |
| --- | --- | --- |
| Backend full suite | PASS: 127, zero failures/skips | `artifacts/p7-a-backend-tests.log`; `services/api/test/*.test.ts` |
| Flutter full suite | PASS: 89, all seven API smoke switches enabled | `artifacts/p7-a-flutter-tests.log` |
| Doctor Portal | PASS: 16, zero failures/skips | `artifacts/p7-a-doctor-tests.log` |
| Admin | PASS: 16, zero failures/skips | `artifacts/p7-a-admin-tests.log` |
| Flutter analyze | PASS: no issues | `artifacts/p7-a-flutter-analyze.log` |
| Backend typecheck/build | PASS | `artifacts/p7-a-backend-build.log`, TypeScript exit 0 |
| Prisma validation/migrations/drift | PASS: valid schema, 14 migrations applied, no difference | Prisma validate, migrate deploy, migrate diff `--exit-code` |
| Android debug arm64 | PASS | `artifacts/p7-a-android-debug.log` |
| Android release arm64 | PASS: unsigned compilation, obfuscated symbols | `artifacts/p7-a-android-release.log`; no signing or distribution |
| Flutter web release | PASS: JavaScript release compilation | `artifacts/p7-a-flutter-web.log`; `build/web` produced |
| Doctor production build | PASS | `artifacts/p7-a-doctor-build.log` |
| Admin production build | PASS | `artifacts/p7-a-admin-build.log` |
| Source secret pattern scan | PASS: 310 files, zero findings | `node ops/scan-secrets.mjs`; source/config/docs only, not Git history or secret-store audit |
| iOS / physical device / deployment | NOT TESTED | No macOS/Xcode validation, device acceptance or deployment performed |

Combined automated suites: **248 passing tests, zero failures, zero skips**.
Backend coverage includes authentication, authorization, doctor ownership,
payments/refunds/webhooks, AI safety, privacy export/deletion, consent and workers.
New regression files are listed below. All existing Phase 0-7 tests were retained.
The web build emitted a non-fatal Cupertino font-family warning; its process
exited 0. Device glyph acceptance remains untested. Android release is unsigned;
release/web example configuration intentionally targets `api.example.invalid`.
Neither artifact proves deployment or production connectivity.

Full Flutter invocation from `apps/mobile`:

```sh
flutter analyze
flutter test --concurrency=1 --dart-define=API_BASE_URL=http://127.0.0.1:3008/api/v1 --dart-define=RUN_API_SMOKE=true --dart-define=RUN_AUTH_SMOKE=true --dart-define=RUN_PROGRAM_SMOKE=true --dart-define=RUN_CONSULTATION_SMOKE=true --dart-define=RUN_COMMERCE_SMOKE=true --dart-define=RUN_ASSISTANT_SMOKE=true --dart-define=RUN_MEMBERSHIP_SMOKE=true
```

Backend: `npm run typecheck`, `npm run build`, `npm test` with an isolated
configured `DATABASE_URL` and `AUTH_INTEGRATION=true`. Run `npm test` and
`npm run build` separately in each portal. See production-config.md for public
release defines and private signing separation. Compile-only production examples
use `api.example.invalid`; they are not deployable API configuration.

## Real browser doctor regression

PASS in dedicated `p7a-doctor` browser against API 3008 / portal 5174:

1. Fixed +91 field accepts the ten-digit existing DEMO doctor number.
2. Incorrect OTP rejected; valid random development OTP opens Doctor Home/Agenda.
3. Doctor session/profile endpoint reports READY; cookie inaccessible to page JS;
   no localStorage/sessionStorage bearer. Cookie-only admin request denied.
4. Full browser reload restores Home/Agenda using the same server session.
5. Logout then reload returns to sign-in.
6. Normal user OTP login shows access denied and the customer app link; no doctor
   workspace; direct doctor API access denied.

Codes/cookies stayed in the browser; output contained only booleans and UI labels.
Missing/incomplete profiles, pending verification, expired/replayed OTPs,
server-side role denial and cross-doctor ownership are additionally covered in
backend and portal tests. These are local development authentication checks,
not SMS delivery acceptance.

## Remaining launch work

Technical: Razorpay checkout/verified fulfilment; recurring membership adapter;
email verified-contact/consent/worker routing; WhatsApp assistant response delivery;
Flutter Firebase permission/registration/refresh hooks; real video adapter;
secure upload/signed media; historical non-UTC timestamp audit; external alert
routing and recovery acceptance. Do not enable these by setting credentials alone.

External/business: provider selections/accounts, commercial and sender approvals,
Meta verification, webhook registrations, approved domains, sandbox recipients,
Firebase/APNs ownership, storage policy, monitoring/on-call owners, private signing,
iOS environment, approved logo and remaining legal/clinical/operational launch
acceptance. No external approval or delivery was manufactured.

## Files created

- `services/api/src/modules/auth/doctor-session.ts`
- `services/api/src/modules/auth/sms-provider.ts`
- `services/api/src/modules/notifications/channel-providers.ts`
- `services/api/src/modules/notifications/push.ts`
- `services/api/prisma/migrations/20260909070000_provider_push/migration.sql`
- `services/api/test/doctor-session.integration.test.ts`
- `services/api/test/provider-closure.test.ts`
- `services/api/test/provider-delivery.integration.test.ts`
- `apps/doctor-portal/src/session.ts`
- `apps/doctor-portal/test/session.test.ts`
- `docs/provider-configuration.md`
- `docs/p7-a-provider-closure.md`

## Files modified

- `services/api/src/app.ts`
- `services/api/src/config/env.ts`
- `services/api/src/database/database.ts`
- `services/api/src/modules/auth/identity-service.ts`
- `services/api/src/modules/consultations/routes.ts`
- `services/api/src/modules/consultations/consultation-service.ts`
- `services/api/src/modules/payments/razorpay.ts`
- `services/api/src/modules/payments/webhook.ts`
- `services/api/src/modules/assistant/whatsapp.ts`
- `services/api/src/worker.ts`
- `services/api/prisma/schema.prisma`
- `services/api/test/operations.test.ts`
- `apps/doctor-portal/src/api.ts`
- `apps/doctor-portal/src/main.ts`
- `apps/doctor-portal/.env.example`
- `.env.example`
- `docs/production-config.md`
- `docs/production-runbook.md`
- `docs/doctor-portal-login.md`

Generated Prisma/build outputs and local validation helpers/logs are ignored
artifacts, not new application source. Existing local API readiness was checked
after the additive migration and restart. No production service was changed.
The isolated API, portal, database and browser were stopped after testing; their
temporary runtime credentials were removed. The user's existing local services
were left running.
