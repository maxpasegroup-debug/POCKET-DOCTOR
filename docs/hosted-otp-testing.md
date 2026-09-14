# Hosted OTP preview for dummy Patient accounts

> Superseded for current deployments: use [Hosted staging authentication](hosted-testing-authentication.md).
> Patient and Doctor preview now require an explicit private `OTP_TEST_ACCOUNTS` map.
> The Patient-only behavior and validation below are the historical 2026-09-10 implementation.

This mode supports phone → server-generated six-digit code shown in the debug app
→ verification → Patient session. No SMS is sent. It does not prove ownership of
a phone number. Use only a separate dummy-data database, never real user records.

Deploy the code containing this mode before changing Railway variables:

```dotenv
APP_ENV=staging
NODE_ENV=production
OTP_MODE=testing
ADMIN_SECURITY_MODE=disabled
```

Keep the existing configured `DATABASE_URL` (dummy data only) and random
`SESSION_SECRET`. Keep payments, demo catalog flags, development AI, document
deferral and other local-only flags disabled. No SMS credentials are required.
The API retains `HOST=0.0.0.0` so Railway can reach it. Existing development OTP
remains local-only. Production rejects `OTP_MODE=testing` at startup.

From `apps/mobile`:

```powershell
flutter run --dart-define-from-file=config/railway-testing.json
flutter build apk --debug --dart-define-from-file=config/railway-testing.json
```

The debug client displays “Testing only · No SMS sent” and the returned
`developmentCode`. The existing API field is retained for compatibility.
Preview is hidden without explicit opt-in, in production configuration, and in
profile/release builds. Builds requesting preview outside debug fail configuration.

Existing and newly created Patient USER accounts can sign in. Doctor, Admin,
mixed-role and inactive accounts cannot use testing OTP, including by changing
the request context or their role between request and verification. Existing
Doctor registration/login rules remain available in local development/provider
mode. This hosted mode is for Patient testing only.

Codes remain random, HMAC-hashed, five-minute, single-use, with the existing
five-attempt lockout, resend cooldown and rate limits. Testing sessions last one
hour. Challenge and session hashes are scoped to testing, so switching to provider
mode rejects outstanding preview codes and sessions. Session verification also
rejects accounts that acquire a privileged role after testing login.

Before real users: use a clean production database, configure and validate the
SMS provider, set `APP_ENV=production`, `OTP_MODE=provider`, and use the production
Flutter configuration with `SHOW_DEVELOPMENT_OTP=false`. Remove dummy accounts and
revoke test sessions through the established maintenance process; do not copy
dummy identities or health data into production. Do not return to testing mode
on the real database. No automatic database reset or migration is part of this change.

Regression evidence comes from `test/testing-otp.integration.test.ts` in the API
and `test/widgets/testing_otp_test.dart` in the Patient app. These run locally;
Railway deployment and interactive device acceptance are separate checks.

## Local validation — 2026-09-10

- Backend: `npm test` — 172 passed, 0 failed, 0 skipped, against the isolated
  local PostgreSQL test database (`artifacts/hosted-otp-backend-tests.txt`).
- Backend: `npm run build` and `npm run typecheck` passed, including Prisma
  client generation. No database migration was needed or performed.
- Patient: `flutter analyze --no-pub` — no issues.
- Patient Android debug build with `config/railway-testing.json` passed
  (`assembleDebug`, 131.8 seconds). APK: `artifacts/pocket-doctor-testing-debug.apk`;
  build log: `artifacts/hosted-otp-debug-build.log`.
- Patient: `flutter test --no-pub --reporter expanded` — 89 passed, 0 failed,
  7 existing opt-in API smoke tests skipped. Logs are in
  `artifacts/hosted-otp-flutter-analyze.txt` and `artifacts/hosted-otp-flutter-tests.txt`.
- The first backend run caught an incorrect assumption in the new test: Fastify
  strips additional JSON properties. The corrected regression verifies that a
  client-supplied ADMIN role still results in a server-assigned USER, and the
  complete suite was rerun successfully. Existing assertions were preserved.
- Railway deployment, SMS delivery and physical-device acceptance have not been
  performed for this change. The hosted environment still needs the new code and
  variables above before the preview can be used there.
