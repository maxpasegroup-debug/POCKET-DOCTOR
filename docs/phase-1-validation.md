# Phase 1 validation

Status: **COMPLETE for the defined Phase 1 scope**, locally validated on
7 September 2026. This is not a public production launch or a compliance claim.
Phase 2 has not been started.

## Environment

- Windows, Node.js 24, Flutter 3.44 / Dart 3.12, Java 17, Android SDK 36.
- Isolated PostgreSQL 18.4 on loopback with generated temporary credentials.
- Development OTP explicitly enabled; synthetic accounts only, no SMS sent.
- No Git repository exists, so no repository or commit was created.

## Automated checks

| Check | Result |
| --- | --- |
| Dart formatting | Passed |
| `flutter analyze` | Passed, no issues |
| `flutter test --dart-define=RUN_API_SMOKE=true --dart-define=RUN_AUTH_SMOKE=true` | 28 passed, no skipped smoke tests |
| Backend build and TypeScript typecheck | Passed |
| Backend tests with `AUTH_INTEGRATION=true` | 18 passed, including database and authentication integration tests |
| Prisma schema validation | Passed |
| Migration deployment | Both foundation and Phase 1 migrations applied successfully |
| Prisma migration/schema comparison | No difference |
| Database connectivity check | Passed |
| Authentication cleanup command | Passed |
| Final compiled API startup and `/api/v1/health` | Passed, HTTP 200 |
| `npm audit --audit-level=high` | Passed, zero reported vulnerabilities |
| Android debug APK | Built successfully |
| Flutter web debug build | Built successfully, including Wasm dry run |

Flutter coverage includes phone/profile validation, OTP state, onboarding,
authentication restoration and transitions, profile save/error state, logout,
offline logout, protected routes, API success/error/401 handling, the four home
services and bottom navigation. All foundation screens are exercised at
320x568, 390x844, 844x390 and 1024x768, with normal and 2x text scaling, without
reported overflow. Original Phase 0 configuration, health and backend coverage
is retained; navigation expectations now reflect authentication guards.

The live Flutter repository smoke test requests a random OTP from the API,
verifies it, saves and retrieves a PostgreSQL profile, restores the session,
logs out, and confirms the revoked token is rejected. Backend tests also verify
OTP expiry, wrong-attempt limits, resend cooldown/hourly limits, concurrent
requests, single-use verification, profile input rejection and session expiry.

## Build artifacts

A local Chrome check at 390x844 exercised onboarding, mobile entry, random
development OTP verification, profile setup backed by PostgreSQL, personalized
home, all four service entry points, profile, settings and confirmed logout.
Onboarding, OTP, profile setup and home screenshots were visually inspected.
The automated journey additionally covers logging back in and restoring the
existing profile. Browser-only development screenshots are ignored artifacts.

- `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk`
- `apps/mobile/build/web/`

Both local validation builds enable `SHOW_DEVELOPMENT_OTP=true`; the Android
build uses `API_BASE_URL=http://10.0.2.2:3000/api/v1`. These are development
artifacts, not signed release distributions. Secure storage is pinned to
10.0.0, which builds with the established Android SDK 36 toolchain. An initial
11.x dependency attempt required SDK 37 and was replaced before the successful
final builds.

## Security and scope checks

An ignore-aware source scan found no private-key blocks or common live-provider
credential patterns. Environment values remain placeholders; temporary local
validation credentials are kept outside source in ignored tooling and removed
after validation. This targeted scan is not a security audit.

Development OTP is disabled by default, rejected in staging/production, and the
development server binds to loopback. Production SMS delivery remains disabled
until a provider is implemented and configured. No courses, bookings, payments,
commerce, diagnosis, real AI, WhatsApp or membership billing were implemented.

## Remaining launch limitations

- No physical-device/emulator runtime check or iOS build was performed here.
  iOS signing, Keychain persistence and native secure-storage behavior still
  require device validation; Android compilation succeeded.
- The approved logo asset is absent. The existing text brand fallback and
  documented asset location remain; no replacement logo was invented.
- Development OTP does not prove ownership of a mobile number. Real SMS
  delivery and operational monitoring require a later provider configuration.
- Browser sessions are memory-only and end on reload. Persistent sessions are
  implemented with native secure storage on Android/iOS.
- India is the enabled country; language preference is saved but UI is English.
- Formal legal policies, deletion/export workflows, deployment, release signing
  and scheduling authentication cleanup remain launch work.
- CI configuration was updated; no remote GitHub Actions run was possible
  without a configured repository.

See [phase-1.md](phase-1.md) for behavior and boundaries and
[phase-1-files.md](phase-1-files.md) for the source inventory.
