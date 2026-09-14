# Phase 10 — Patient core experience

## Audit before implementation (14 September 2026)

The audit preserves `apps/mobile`, the shared `services/api`, hosted staging
testing OTP, existing splash timing and branding. The separate Doctor project
is outside scope. Existing icon/splash changes in the working tree predate this
task. No backend changes are planned.

These initial classifications are source-audit findings, not claims of live
provider or device acceptance. Validation evidence is recorded below separately.

| Module | Initial status | Existing implementation / API |
| --- | --- | --- |
| Authentication | Implemented; validate | `auth_controller.dart`, `api_session_repository.dart`; POST `/auth/otp/request`, `/auth/otp/verify`; GET `/auth/session`; POST `/auth/logout`. Patient requests omit Doctor context. |
| Startup/session | Implemented; validate | Secure session storage, Riverpod auth, protected GoRouter; startup overlay minimum two seconds, no splash spinner, retry on initialization failure. New installs retain onboarding. |
| Home | PARTIAL | Real user, four services, membership, programs and appointments. Separate Home discovery cache is not refreshed after enrollment. Non-featured recorded-only results leave discovery section blank. |
| Programs | Real backend; demo content/payment | `/programs`, categories, detail, `/me/programs`, enrollment, protected lessons and persisted progress. Live schedules are real records; live delivery is not connected. |
| Doctor discovery/booking | Real backend; demo paid booking | `/doctors`, `/specialties`, doctor detail/slots; `/consultations/book`, payment, reschedule, cancel. Server owns availability, time conversion, price, concurrency and authorization. |
| Consultation | PROVIDER-READY / NOT LIVE | `/me/consultations` and detail; status polling, patient-visible summary/follow-up only. No fake video UI. |
| Wellness | Real backend; demo checkout/payment | `/wellness/products`, categories, `/me/cart`, addresses, `/checkout`, `/orders`, order history/payment/cancellation. No claim of delivery or settlement. |
| Assistant | Real records; conditional provider | `/ai/conversations`, messages/history, preferences, memory, goals, check-ins, reminders and status. Controlled development response or configured provider; safe unavailable state otherwise. |
| Membership | PARTIAL | Real plans, current status, quote, subscription, test settlement, manage, events and receipts. Membership actions refresh membership itself but not cached program entitlements/cart/product pricing. |
| Profile/health/settings | Implemented; validate | Auth user retrieval/update; phone is identity, no client role editing. My Health links to persisted goals/check-ins/reminders/programs. Privacy and notification endpoints are connected. |

All paths above are relative to `/api/v1`. Repositories use the central API
client with bearer authorization, a bounded timeout, friendly errors and
401 session invalidation. Repository providers depend on the current user ID.
Network-driven modules have loading/error/retry and honest empty states.

## Confirmed gaps and targeted changes

1. **Home enrollment cache**: program discovery already returns `enrolled`.
   Move Home's discovery provider into the existing application provider file
   and invalidate it after enrollment/payment. No new endpoint or business rule.
2. **Blank Home discovery**: a nonempty recorded catalogue with no featured flag
   renders nothing. Use the first recorded result as a fallback; retain featured
   priority and existing live section. No fabricated content.
3. **Membership-dependent caches**: program detail already returns `memberAccess`
   and `membershipRequired`; wellness detail/cart/checkout already return
   server-calculated prices. Invalidate these existing providers after a
   successful membership operation. Refetch authoritative data rather than
   calculating entitlements or discounts in Flutter.

## Validation

Hosted test OTP is not production SMS. Evidence files below are local ignored
artifacts; no OTPs, session values or database credentials are included in this
document.

| Check | Result | Evidence |
| --- | --- | --- |
| New cache regressions before fixes | 0 passed / 2 failed (expected reproduction) | `artifacts/phase10-refresh-before.log` |
| Cache fixes + non-featured narrow Home | 3 passed / 0 failed | `artifacts/phase10-refresh-after.log` |
| Initial full Patient run | 96 passed / 0 failed / 7 skipped | `artifacts/phase10-patient-tests.log` |
| All seven real API journeys | 7 passed; development providers, real local PostgreSQL | `artifacts/phase10-api-smokes.log` |
| Keyboard tests | 2 passed / 0 failed after correcting test focus-animation ordering | `artifacts/phase10-keyboard-tests.log` |
| Final complete Patient suite, including all smoke and new tests | **105 passed / 0 failed / 0 skipped** | `artifacts/phase10-patient-integrated.log` |
| Initial backend run alongside Flutter | 157 passed / 3 failed / 0 skipped | `artifacts/phase10-backend-tests.log` |
| Full backend rerun alone, unchanged code/tests | **176 passed / 0 failed / 0 skipped** | `artifacts/phase10-backend-retry.log` |
| Backend build / TypeScript / Prisma schema | PASS | `artifacts/phase10-backend-build.log`, `phase10-backend-typecheck.log`, `phase10-prisma.log` |
| Railway health and readiness | Both HTTP 200, read-only | `artifacts/phase10-railway-health.json` |
| Flutter health smoke using the unchanged Railway testing define-file | 1 passed / 0 failed | `artifacts/phase10-railway-flutter-health.log` (additional remote health check, not another unique test) |
| Final Flutter analysis | PASS, no issues | `artifacts/phase10-analyze-final.log` |
| Android debug build, Railway testing define-file | PASS, 114.1 seconds Gradle task | `artifacts/phase10-debug-build.log` |
| APK signature / metadata | PASS, v2 signature; correct Patient package; Internet permission; arm64-v8a, armeabi-v7a, x86_64 | `artifacts/phase10-apk-signature.log`, `phase10-apk-badging.log` |
| Source secret-pattern scan | 324 files, 0 findings; excludes history/external stores | `artifacts/phase10-secret-scan.json` |
| Physical-device acceptance | BLOCKED — connected Android phone remained locked | ADB reported `mDreamingLockscreen=true`; no unlock/credential bypass attempted. |

The initial backend failures were a membership fixture connection timeout and
program discovery returning HTTP 500 (plus its parent suite failure). Membership
setup failed before registering 16 subtests, explaining the lower first-run
count. The machine had 231 MB free RAM at the time. All 176 tests passed on the
unchanged rerun with Flutter no longer running alongside it; resource pressure
is the likely cause, not a proven production diagnosis. No timeouts, assertions
or security controls were weakened. Both runs are retained.

The first combined smoke/keyboard run had 8 passes and 1 keyboard-test failure.
The profile test scrolled before TextField's asynchronous focus scroll finished.
Waiting for that animation before scrolling preserved the same hit-target and
keyboard-bound assertions, and both tests then passed without changing app UI.

Five new tests cover Home enrollment refresh, membership-dependent program and
product/cart refresh, non-featured Home content at 320px/1.5x text, and login and
profile forms above a simulated keyboard. Existing layout tests cover 320x568,
390x844, 844x390 and 1024x768 at 1x/2x text; existing navigation/error tests remain.

Backend regression covers Patient/Doctor/Admin roles, unknown Doctor sign-in,
registration/approval, cross-user ownership, private notes, payment verification,
OTP/session expiry/replay, hosted testing restrictions, AI safety and privacy.

## Delivery boundaries

- No backend source, route, schema, migration, provider or deployment changes.
- No changes to OTP, Railway config, Patient routing, splash, icon or branding in
  this task; prior uncommitted icon/splash work is preserved.
- Real backend-backed local journeys passed. Demo prices, simulated payments,
  demo professionals and development assistant responses are explicitly labelled.
- Railway validation in this task is read-only health/readiness, not remote
  account creation, purchase, delivery, media playback or device acceptance.
- Live SMS, payment settlement/recurring billing, consultation media, private
  credential storage and production provider delivery still require their
  respective integrations, configuration and validation. No provider was added.
- No new core API-contract mismatch remains from this audit. Native secure-store
  restart, device keyboard and real media behavior still need interactive device
  acceptance. iOS and browser persistence were not newly validated.

## Testing APK

`artifacts/pocket-doctor-testing-debug.apk` — 206,113,265 bytes.

SHA-256: `66DBAEB8E6CEBA6175B161D09C6EFFDFDFDB72C279AC6726BCB083C568F16672`.

The local smoke API started for this task was stopped after validation. The
existing test database was left running. No deployment, production mutation or
Git commit was performed. Device acceptance against Railway is the recommended
next validation phase; production provider activation remains outside Phase 10.

## API and environment audit

No endpoint, HTTP-method or response-envelope mismatch was found in the audited
Patient repositories against `services/api/src/modules/*/routes.ts`. The live
local smoke journeys are the executable contract check, including Dart DTOs.

| Flutter repository | Backend module | Important boundary |
| --- | --- | --- |
| `auth/data/api_session_repository.dart` | `auth/routes.ts`, `identity-service.ts` | Patient LOGIN context, single-use OTP, opaque session; profile PATCH cannot set roles. |
| `programs/data/program_repository.dart` | `programs/routes.ts`, `program-service.ts` | List uses `programs`; detail `program`; progress/overview direct `data`; lessons require enrollment/entitlement. |
| `consultation/data/consultation_repository.dart` | `consultations/routes.ts` | `doctor`, `slots`, `consultation` envelopes; UTC instants, doctor calendar timezone; private notes excluded from Patient DTO. |
| `wellness/data/commerce_repository.dart` | `wellness/routes.ts` | Absolute cart quantities, server checkout quote and idempotency key; payment outcome is verified server-side. |
| `assistant/data/assistant_repository.dart` | `assistant/routes.ts` | `items`/`item` envelopes; account-scoped records, explicit consent, stable message request key. |
| `membership/data/membership_repository.dart` | `membership/routes.ts` | Server plans/prices, current entitlement, verified development settlement, account-scoped receipts. |
| `privacy/data/privacy_repository.dart` | operations/privacy routes | Notifications, consent/export/deletion remain authenticated and owner-scoped. |

The default bare Flutter build uses localhost. The delivered testing APK must
explicitly use `apps/mobile/config/railway-testing.json`, which points at
`https://pocket-doctor-production.up.railway.app/api/v1` with staging/debug OTP
preview enabled. This file and the OTP implementation are unchanged.

From `apps/mobile`:

```powershell
flutter analyze
flutter test --concurrency=1
flutter build apk --debug --dart-define-from-file=config/railway-testing.json
```

The six mutation-based API smoke journeys assert a loopback backend and use
synthetic accounts and existing demo seed data. Do not enable them against
Railway by removing those safety assertions. The health-only smoke can target
Railway without modifying remote data.

Native Android session persistence uses secure storage; web testing intentionally
keeps tokens in memory, so browser refresh does not retain a web session.
Native logout clears local state even when server revocation cannot be reached,
with an explicit warning; such server sessions still expire normally.
