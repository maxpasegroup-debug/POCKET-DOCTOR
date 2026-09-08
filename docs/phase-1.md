# Phase 1 — Authentication + User App

## Scope

Phase 1 adds the first authenticated customer journey to the Phase 0 architecture.
No Phase 2+ business workflows are implemented. Production OTP delivery is pending;
local development uses explicit, random, expiring one-time codes with real sessions
and PostgreSQL persistence. It does not verify phone ownership through SMS.

## Screens and journey

Splash checks the session and routes to onboarding, login, required profile setup
or Home. Onboarding has three introductions and Skip/Next/Get started. Login validates
Indian mobile numbers; OTP supports paste/autofill, expiry, wrong-code errors, resend
cooldown and changing the number. New users enter a name and language, optionally
choose wellness interests, then enter their personal Home. Existing accounts restore
their saved profile. Profile can be edited; Settings includes logout with confirmation.

| Screen | Phase 1 behavior |
| --- | --- |
| Splash | Initialization, secure-token restore, friendly network/storage retry |
| Onboarding | Physical health, mental wellbeing and wellness introductions |
| Login / OTP | Backend-connected challenge, verification and session creation |
| Profile setup/edit | Validation, save/error state and persistent profile updates |
| Home | Name/time greeting, profile-based interests, four service entry points |
| Programs | Filterable preview themes, recorded/live distinction, future-state detail |
| Consultation | Doctor discovery, speciality and appointment/type preview |
| Wellness Medicines | Six curated collection entries; no products, cart or checkout |
| Assistant | Chat shell and suggested questions opening safe unavailable states |
| My Health | Saved interests and honest empty goals/habits/program activity |
| Profile | Name, mobile, language, interests and account navigation |
| Settings | Persisted future-notification preference, privacy, terms, help, logout |
| Notifications | Category filters and empty states; no push delivery |

Service preview content is explicitly labelled. There are no invented doctors,
patient scores, prices, booked appointments, program completions or AI replies.
The approved logo is still missing; the existing plain-text fallback is reused.

## APIs and state

Implemented: POST /auth/otp/request, POST /auth/otp/verify, GET /auth/session,
GET/PATCH /users/me, POST /auth/logout, plus retained health/readiness endpoints.
All paths use /api/v1. See [API contract](api.md).

Riverpod owns auth/session/profile state. A central package:http client handles
bearer credentials, timeouts, safe errors and unauthorized responses. The session
repository maps typed DTOs. GoRouter redirects incomplete or signed-out users before
protected screens render. The existing five-tab stateful navigation shell is retained.
Resume revalidates the session; late responses cannot revive a logged-out identity.

Mobile credentials use OS secure storage. The web validation target stores tokens
only in memory, so reload requires login. Shared preferences store no credentials.
Offline logout clears local state and explains that server revocation was not confirmed.

## Development authentication

Set OTP_MODE=development and a random SESSION_SECRET of at least 32 characters in
the ignored backend environment. The API binds to loopback in this mode and rejects
it in staging/production. SHOW_DEVELOPMENT_OTP=true displays the explicitly labelled
code only in a Flutter development environment. No SMS is sent or fixed code accepted.

OTP: five-minute lifetime, five wrong attempts, one-minute resend cooldown, five
requests per phone per hour; per-IP request limits also apply. Codes are HMAC-hashed.
Database locks prevent concurrent verification/replay. Sessions use random 256-bit
tokens, hashed at rest, fixed seven-day expiry and backend revocation on logout.
Schedule npm run auth:cleanup hourly; no production scheduler is provisioned.

## Validation

Final results are recorded in [phase-1-validation.md](phase-1-validation.md).
The original Phase 0 unit/health/backend coverage is retained. Widget navigation
expectations were updated for the authenticated flow and extended to all new screens.
Tests include route guards, profile validation/errors, OTP state, expiry, offline
logout, HTTP error mapping, small screens and 2× accessibility text.

## Known limitations and future work

- Production SMS provider/credentials, delivery monitoring and real ownership
  verification are not configured. Development accounts must stay isolated.
- India is the only enabled country. Language preference is saved; UI remains English.
- iOS build, Keychain persistence and signed-device checks require macOS/Xcode.
- Android secure storage uses the SDK-36-compatible 10.0.0 release; upgrading to 11
  requires a separately validated SDK/Gradle upgrade.
- Web is a validation surface with memory-only sessions, not a production customer web app.
- Logo/native icons, formal privacy/terms, deletion/export workflows, cloud scheduling,
  deployment, release signing and device-level security verification remain future work.
- No health records or detailed medical data are collected; no compliance is claimed.
- No Git repository exists. None was created and no commit was made.

Phase 2 may add real doctor-led learning programs after separate authorization.
Consultations, commerce, AI/WhatsApp, memberships and public-launch work remain later
phases. Start from the existing repository, DTO and route boundaries rather than
replacing them. Phase 2 is not started by this work.
