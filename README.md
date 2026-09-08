# Pocket Doctor

**Your Doctor. In Your Pocket.**

Pocket Doctor is a health and wellness ecosystem for physical health, mental
wellbeing and everyday wellness: **Learn → Act → Track → Consult → Support → Improve**.

## Phase 7: Operations, security and production readiness

The Doctor Portal web application has been removed from this project. The
supported clients are the Flutter user app and Admin Console. Backend doctor
roles, profiles and consultation APIs remain available for existing workflows.

The admin control center, durable audit/MFA controls, account status management,
privacy/consent/export screens, unified inbox and notification worker now extend
the existing platform. Provider adapters and deployment/recovery procedures are
prepared; **public launch remains blocked**. Live checkout/recurring settlement
and production SMS still need integration and acceptance; no legal compliance,
live payments, live delivery or signed store release is claimed.

Start with [Phase 7](docs/phase-7.md), [validation/readiness matrix](docs/phase-7-validation.md),
[security audit](docs/phase-7-security-audit.md), [business/legal readiness](docs/phase-7-compliance-readiness.md),
[configuration](docs/production-config.md) and [runbook](docs/production-runbook.md).
The admin console lives in `apps/admin-console`; use `npm ci`, an explicit
`VITE_API_BASE_URL`, and `npm run dev`. A provisioned ADMIN account is required;
there is no default credential. Backend `npm run worker` starts bounded inbox
collection/delivery cycles. External channels remain disabled unless configured.

Validate with API `npm test`, `npm run typecheck`, `npm run db:validate`; Admin
Console `npm test` and `npm run build`; Flutter `flutter analyze`, `flutter test`,
Android debug and explicit production-configured web/release builds. Run
`node ops/scan-secrets.mjs` and `node --test ops/test/*.test.mjs` at the repository
root. Exact commands, all API smoke flags, limits and evidence are in the
validation document. The CI workflow contains no fixed database password.

Historical phase notes below describe their state at delivery; Phase 7 documents
supersede older admin/notification statements. No later phase is started.

## Phase 6: Membership + Revenue Engine

Optional membership now connects selected programs, consultation discounts,
wellness member pricing and configured assistant benefits. Backend-controlled
plans, trials, coupons, subscriptions, cancellation, manual renewal, receipts
and ADMIN-only revenue reporting reuse the existing identity/payment systems.
The free experience remains available. **Production recurring payments remain
unconfigured**; local payments and seeded prices are explicitly DEMO.

See [Phase 6 architecture and usage](docs/phase-6.md),
[validation](docs/phase-6-validation.md) and [security review](docs/phase-6-review.md).
From `services/api`, apply migrations with `npm run db:deploy`, then run
`npm run membership:seed` only in an isolated development database after the
existing demo seeds. `npm run membership:cleanup` performs lifecycle maintenance.
No new credentials are needed; the existing `PAYMENT_MODE` guard applies.

Flutter uses the existing run configuration. Open Membership from Home or
Profile, select a plan, review the server quote, optionally apply a coupon,
complete the labeled demo payment, and manage benefits/cancellation/receipts.
Run `flutter analyze`, `flutter test`, API `npm test`, and Admin Console
`npm test`/`npm run build`. Real membership API smoke testing additionally uses
`--dart-define=RUN_MEMBERSHIP_SMOKE=true` with the existing smoke flags and a
loopback `API_BASE_URL`; see the validation document for the exact commands.

This historical Phase 6 scope is extended by Phase 7 above.

## Phase 5: Personal AI Health Assistant + WhatsApp

The Assistant now provides stored conversations, explicit memory controls,
wellness goals, optional check-ins, reminders and account-grounded navigation.
Backend safety checks and reviewed responses keep diagnosis, prescriptions and
privileged actions outside AI capabilities. WhatsApp linking and signed webhooks
are provider-ready; **outbound WhatsApp delivery is not operational**.

Set `AI_PROVIDER=development` only for local demo responses, or configure the
backend OpenAI adapter with `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`,
`AI_TIMEOUT_MS` and `AI_MAX_OUTPUT_TOKENS`. The safe default is disabled. Users
enable chat processing in Assistant privacy settings. No provider key belongs in
Flutter. Apply `npm run db:deploy` before starting the API.

Start at Home → Assistant → privacy settings → conversation, or use goals,
check-ins and reminders independently. See [Phase 5](docs/phase-5.md) for setup,
APIs, privacy, limits, tests and provider dependencies, and
[validation results](docs/phase-5-validation.md). Phase 6 is not started.

## Phase 4: Exclusive Wellness Products & Commerce

Wellness now supports a curated catalogue, categories, collections, search, product
details, persistent cart, private delivery addresses, server-priced checkout,
inventory reservations, verified demo payments, order history and tracking.
Products and shipping addresses are snapshotted at purchase. Transactional stock
controls prevent two buyers claiming the final unit; checkout and settlement are
idempotent. Restricted/eligibility-gated products cannot be purchased.

This is **local demo commerce, not a production store**. No real money or goods
move. Existing payments and identity are extended rather than replaced. No full
admin dashboard was introduced by Phase 4.

Set `DEMO_WELLNESS=true` and `PAYMENT_MODE=development` only locally, apply
`npm run db:deploy`, then run `npm run wellness:seed` in `services/api`.
Only two clearly marked non-ingestible demo products are seeded; existing stock
is preserved on repeat. Run `npm run commerce:cleanup` to release expired holds.
See [Phase 4 architecture and operations](docs/phase-4.md),
[validation](docs/phase-4-validation.md) and [file inventory](docs/phase-4-files.md).

## Preserved Phase 3: Doctor Consultation & Doctor Network

Talk to a Doctor now includes doctor discovery, server-generated slots, reservation
review, payment state, confirmation, rescheduling, cancellation, records and history.
Backend doctor APIs manage agenda, availability, bio, notes and follow-up.
Booking concurrency and paid confirmation are enforced in PostgreSQL.
Existing program, identity and payment architecture is reused.

**Live video/audio/chat and real-money payments are not enabled.** The app clearly
labels provider-ready reservations and local DEMO accounts. No real consultation,
doctor credential, refund or medical outcome is simulated as fact.

See [Phase 3 setup, architecture and APIs](docs/phase-3.md),
[validation evidence](docs/phase-3-validation.md). Local consultation
validation requires `DEMO_CONSULTATIONS=true`, `PAYMENT_MODE=development`, database
migrations and `npm run consultations:seed`. Demo flags are rejected in
staging/production. The existing Flutter run commands remain valid.

## Preserved Phase 2: Learn & Transform

The program ecosystem adds discovery/search, data-driven categories, recorded and
live program details, free enrollment, an explicit development payment simulator,
My Programs, video/reading lessons, saved positions and program completion.
Enrollment and progress live in PostgreSQL; protected lesson content is available
only after server-side entitlement checks. The four core services remain visible.

For local program validation, set `DEMO_PROGRAMS=true` and
`PAYMENT_MODE=development` in the backend environment, run `npm run db:deploy`,
then `npm run programs:seed` in `services/api`. The seed creates only three clearly
labelled demo programs for weight management and diabetes/lifestyle, including one
live schedule. Demo professional profiles have no fabricated credentials. No money
is charged. Both flags are forbidden in staging/production, and demo servers bind
to loopback. Production Razorpay checkout is disabled until a real adapter is added.

See [Phase 2 architecture and operation](docs/phase-2.md) and
[validation results](docs/phase-2-validation.md). Use the existing run commands
below; no replacement backend or state-management framework was introduced.

## Preserved Phase 1: Authentication + User App

The app now supports onboarding, Indian mobile-number sign-in, OTP verification,
secure mobile sessions, basic profile setup/editing, a personal Home, My Health,
settings, notification preferences and logout. Four explorable landing experiences
introduce Learn & Transform, Talk to a Doctor, Wellness Medicines and AI Health Assistant.

Authentication is real API/database/session behavior with an **explicit local
development OTP mechanism**. No SMS is sent. Random one-time codes are available
only when development mode is deliberately enabled. Production SMS delivery is not
configured; public launch is not implied. No real-money checkout,
AI replies, prescriptions, WhatsApp or push delivery is implemented.

## Stack and structure

Flutter 3.44 / Dart 3.12, Riverpod, go_router and the existing package:http client.
Android + iOS architecture; web is a validation target. Node 24 LTS, TypeScript,
Fastify, Prisma 7 and PostgreSQL 17+ remain the Phase 0 backend.
The Admin Console uses Vite and TypeScript with the same REST backend;
Flutter continues to use Riverpod exclusively.

```text
apps/mobile/lib/
  core/              Config, theme, routing, API client and secure storage
  features/auth/     Models, repository, controller and sign-in screens
  features/profile/  Profile models, setup/edit and profile screen
  features/          Home, programs, consultation, wellness, assistant, health,
                     settings and notifications
  shared/widgets/    Brand fallback, forms, cards, loading/error/future states
services/api/
  src/modules/auth/  OTP/session service, role contracts, routes and profile validation
  prisma/            Identity/profile/session schema and ordered migrations
  test/              Foundation and PostgreSQL identity integration tests
docs/                Architecture, API, security, design and phase reports
apps/admin-console/ Operations and administration web app
```

No approved logo has been supplied. Place it exactly as described in
[assets/brand](apps/mobile/assets/brand/README.md). Plain-text branding and native
scaffold icons remain explicit placeholders; no logo has been redesigned.

## Backend setup

Requirements: Node 24, npm and a dedicated local PostgreSQL database. From the root:

```powershell
Copy-Item .env.example services/api/.env
cd services/api
npm ci
npm run build
```

Edit `services/api/.env` locally:

- `DATABASE_URL`: your dedicated development PostgreSQL URL.
- `APP_ENV=development` and `NODE_ENV=development`.
- `OTP_MODE=development` to explicitly enable local sign-in.
- `SESSION_SECRET`: at least 32 random characters, generated privately.
- `CORS_ORIGINS=http://localhost:8080,http://127.0.0.1:8080` for browser testing.

For example, generate a secret in your local terminal with
`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
and save it only in the ignored environment file. Never put it in Flutter config,
screenshots, Git or chat.

```text
npm run db:validate
npm run db:deploy
npm run db:check
npm run dev
```

Development OTP mode **binds the API to loopback**, regardless of HOST. It is
for isolated local data only, not real customer verification. Codes expire after
five minutes, have five attempts, a one-minute resend delay and a five-per-hour
phone limit. Codes are random, never fixed or logged, and only HMAC hashes are stored.

`OTP_MODE=disabled` is the default. Staging/production reject development OTP mode.
A production delivery adapter, provider credentials and delivery-abuse testing
must be implemented before enabling real sign-in there. Existing Phase 0 liveness
can still start without DATABASE_URL; authenticated APIs need a configured database.

Compiled runtime: `npm run build`, then `npm start`.
Health: `GET /api/v1/health`. Readiness: `GET /api/v1/health/ready`.
Apply migrations before startup; never use migrate reset or db push in production.
Create future development migrations with `npm run db:migrate -- --name descriptive_name`.

## Run Flutter

```text
cd apps/mobile
flutter pub get
flutter run --dart-define=APP_ENV=development --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1 --dart-define=SHOW_DEVELOPMENT_OTP=true
```

The URL above targets the Android emulator. The development code is explicitly
labelled **No SMS sent** on the OTP screen when SHOW_DEVELOPMENT_OTP is enabled.
For a physical Android device, use `adb reverse tcp:3000 tcp:3000` and
`API_BASE_URL=http://localhost:3000/api/v1`. Android cleartext is debug-only.
iOS requires macOS/Xcode and an HTTPS development endpoint or a narrowly scoped
debug transport exception; no global ATS bypass is included.

Browser preview:

```text
flutter run -d chrome --web-port=8080 --dart-define=SHOW_DEVELOPMENT_OTP=true
```

Mobile tokens use OS secure storage. The browser validation target keeps tokens
**in memory only**, so a page reload signs it out. Onboarding completion is a
non-sensitive preference. Staging/production require explicit HTTPS API_BASE_URL;
Flutter dart-defines are public build settings and must contain no secrets.

User journey: splash → up to three introduction pages → mobile number → OTP →
profile setup for a new account → Home. Returning accounts restore their profile.
Bottom tabs: Home / Programs / Consult / Assistant / Profile. Home also opens
Wellness Medicines and My Health; Profile opens editing, Settings and Notifications.

## Validation commands

Backend, from `services/api`:

```text
npm run build
npm run typecheck
npm run db:validate
npm test
npm audit
```

Foundation tests need no database. To run the full identity integration suite,
export DATABASE_URL for an **isolated test database**, apply migrations, and set
`AUTH_INTEGRATION=true`. The tests create and remove their own synthetic accounts.
Do not point these tests at production.

Flutter, from `apps/mobile`:

```text
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test
flutter test --concurrency=1 --dart-define=RUN_API_SMOKE=true --dart-define=RUN_AUTH_SMOKE=true --dart-define=RUN_PROGRAM_SMOKE=true --dart-define=RUN_CONSULTATION_SMOKE=true --dart-define=RUN_COMMERCE_SMOKE=true
flutter build apk --debug
flutter build web --debug
```

The five opt-in smoke tests require a running local API; the auth smoke additionally
requires PostgreSQL and explicit development OTP mode. It exercises the real Flutter
repository against the API. Regular tests use isolated fakes and skip those external
checks. Existing Phase 0 coverage is retained; widget expectations now reflect the
authenticated journey. The program smoke also requires the demo program seed and
development payment mode. Consultation smoke also requires `DEMO_CONSULTATIONS=true`
and `npm run consultations:seed`. Commerce smoke requires `DEMO_WELLNESS=true` and
`npm run wellness:seed`. CI provisions disposable PostgreSQL and runs all five.

Android builds use the Phase 0 SDK 36 toolchain. Secure storage is pinned to the
compatible 10.x line. On macOS also run `flutter build ios --debug --no-codesign`
and test Keychain persistence on a device. Release signing is not configured.

## Operations, privacy and roadmap

Schedule `npm run auth:cleanup` hourly to remove expired sessions and OTP challenge
records older than one hour. The command is available in the Docker image; no
cloud scheduler is provisioned. Session expiry is enforced even before cleanup.
Use separate development/staging/production databases, secrets and origins. Keep
database TLS, least-privilege credentials, backups and proxy policy deployment-specific.

The Railway Dockerfile/config and GitHub CI definition remain available; neither
has been deployed by this task. There is no Git repository, so no commit or remote
was created. Follow the existing Git workflow only if one is later configured.

Profile fields are deliberately limited to name, verified-through-the-selected-mode
mobile identity, language, optional wellness interests and a reminder preference.
No age, gender or medical history is requested during profile setup. Phase 3 keeps
doctor-entered consultation notes separate and access-controlled. English is the only
current UI language; preferences are stored for future localization. Privacy/terms
screens describe the preview and explicitly identify formal policies as pending review.

- [Phase 1 report](docs/phase-1.md)
- [Architecture](docs/architecture.md)
- [API contract](docs/api.md)
- [Security](docs/security.md)
- [Design system](docs/design-system.md)
- [Historical Phase 0 validation](docs/validation.md)

Phase 2 implements programs; Phase 3 implements consultation reservations and
records; Phase 4 implements curated Wellness commerce within documented local
demo/provider boundaries. AI/WhatsApp, memberships and production launch remain
later phases. No regulatory compliance or public-launch readiness is claimed.
Phase 5 has not started.
