# Phase 2 validation

Status: **COMPLETE for the defined Phase 2 scope**, locally validated. This is not
a production launch. Phase 3 has not been started.

Local validation performed on 7 September 2026 with Flutter 3.44 / Dart 3.12,
Node.js 24, Java 17, Android SDK 36 and isolated PostgreSQL 18.4.

## Automated results

| Check | Result |
| --- | --- |
| Dart formatting | Passed |
| `flutter analyze` | Passed, no issues |
| Full Flutter suite with all three live smoke flags, serial execution | 36 passed; no skipped tests |
| Backend TypeScript build and typecheck | Passed |
| All backend tests, `AUTH_INTEGRATION=true` | 27 passed; no skipped tests |
| Prisma schema validation | Passed |
| Three migrations deployed to a fresh PostgreSQL database | Passed |
| Prisma database/schema comparison | No difference |
| PostgreSQL connection and HTTP health | Passed |
| Expired-authentication cleanup command | Passed |
| Backend dependency audit | Zero reported vulnerabilities |
| Android debug APK, final source | Passed |
| Web debug build, final source | Passed, including Wasm dry run |

Flutter smoke tests used the actual local API/database for OTP, profiles, session
restoration/revocation, discovery, categories, free and paid demo enrollment,
lesson-position restoration, completion and live schedules. Backend tests also
cover concurrent duplicate enrollment/settlement, payment failure, order/amount/
currency checks, cross-user denial, hidden protected content, invalid IDs,
unverified professionals, and demo configuration being forbidden in deployments.

Widget tests cover discovery/search/filtering, details, enrollment, simulated
payment failure/retry, My Programs, lesson navigation/completion, progress errors,
empty states and live schedules. New program screens were checked at 320px width
with 2x text. Existing Phase 1 screen coverage remains at 320x568, 390x844,
844x390 and 1024x768 with normal/2x text, including login/profile/logout/navigation.

Browser inspection also found a stale generated Flutter web plugin registrant:
it contained Phase 1 plugins but omitted the newly installed video player. The
generated web compilation cache was removed, preserving source and the Android APK,
and a fresh build regenerated the correct video-player registration. A successful
compilation alone was therefore not treated as proof of playback.

An earlier overlapping Android-build/test run produced one authentication smoke
failure. The API logged a sanitized internal error. After the build finished,
the complete serial run passed, and a second final serial run passed with the
additional retry/encoding tests. Resource contention is a possible explanation,
not a confirmed root cause; no failure was hidden or test disabled.

## Artifacts

Chrome validation at 390x844 confirmed login/profile restoration, persisted
enrollment after re-login, discovery/details, free enrollment, protected video
initialization and actual play/pause state. The clean build reports video readyState
4 with no media error; the public demonstration clip decodes and plays. Screenshots
of discovery and the lesson were visually inspected. The plugin-registration cache
issue described above was resolved before this playback check.
Both lessons were completed through the browser and the overview showed 2/2,
100% and a completion date. This also exposed a missing fallback navigation on a
standalone completion page; an explicit Back-to-Programs fallback and regression
assertion were added before the final validation run.

- `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk`
- `apps/mobile/build/web/`

These are local development builds with `SHOW_DEVELOPMENT_OTP=true`. Android uses
`API_BASE_URL=http://10.0.2.2:3000/api/v1`. They are not signed production releases.
Final artifacts were produced at 13:57 (Android) and 13:59 (web), local time.

## Security and limits

Source scanning found only `.env.example` among visible environment files and no
common live-token/private-key patterns. Development accounts, runtime credentials
and browser captures were confined to ignored validation tooling. This is a targeted
check, not a security audit or compliance certification.
The dedicated browser, local API/static server and isolated PostgreSQL instance
were stopped, and temporary runtime credentials and OTP captures were removed.

Real SMS, Razorpay, private video delivery, reviewed professional content, live
joining, physical-device testing, iOS builds and deployment remain outside these
local results. No real charges, fabricated credentials, medical outcomes or
certificates were produced. Git was not configured; no repository or commit was
created. Phase 3 has not been started.
The CI definition was updated but no remote GitHub Actions run was performed.

See [Phase 2 architecture](phase-2.md) and [file inventory](phase-2-files.md).
