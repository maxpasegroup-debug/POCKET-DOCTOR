# Phase 3 validation — 7 September 2026

Local environment: Windows, Node 24, Flutter 3.44 / Dart 3.12, JDK 17,
Android SDK 36 and an isolated loopback PostgreSQL database. Only synthetic
profiles, demo programs and demo consultations were used. No external SMS,
payment, medical consultation or production data was involved.

## Automated results

| Check | Result |
| --- | --- |
| Flutter complete suite, all four live smoke flags enabled | 45 passed, zero skipped |
| Flutter consultation widgets, including delayed payment refresh | 8 passed |
| Flutter analyze | No issues |
| Dart repository format check | Passed |
| Backend complete suite with PostgreSQL | 37 passed, zero skipped |
| Backend strict TypeScript check and build | Passed |
| Prisma schema validation | Passed |
| All four migrations on a fresh database | Passed |
| Prisma database/schema drift check | No difference |
| Backend liveness and database readiness | HTTP 200, phase 3 / ready |
| Doctor portal tests | 8 passed |
| Doctor portal strict TypeScript and production build | Passed |
| Doctor portal dependency audit | Zero known vulnerabilities reported |
| Final Android debug artifact after payment fix | Passed; 230,201,295 bytes |
| Final Flutter web debug artifact after payment fix | Passed; 12,742,737-byte main.dart.js |

The PostgreSQL suite exercises simultaneous same-slot booking (one succeeds, one
returns 409), direct database overlap rejection, doctor verification visibility,
role and record ownership, free/paid booking, failed payment retry, duplicate
settlement, expiry/release, cancellation policy, atomic rescheduling, private vs
shared notes, availability/profile updates and deployment demo-mode restrictions.
Clock tests cover India offsets, DST repeated instants, midnight and exception
dates. Signature tests reject tampered raw webhook bytes and unconfigured access.
Existing auth, profile, program entitlement/progress and health tests remain green.

The pg driver emits a non-failing deprecation warning during concurrent Prisma
queries; the current locked pg 8 behavior passed all transaction assertions.
Review that adapter behavior before upgrading to pg 9.

## Browser review

Doctor portal review passed after correcting native-fetch receiver binding and
appointment-row contrast. Tested actual OTP login, profile and availability saves,
populated agendas at desktop/mobile sizes, appointment detail, demo start,
separate private/shared notes and follow-up, completion, persisted completed record,
and logout clearing private DOM. A tablet axe audit reported zero violations.
The independent evaluator used the available inherited model; no different-provider
evaluator was available.

The customer browser check covers actual onboarding/sign-in/profile, Home service
entry, discovery, professional profile, backend-generated slots and booking review.
It exposed a payment-dialog controller lifecycle bug during asynchronous detail
refresh. A new delayed-response/polling widget test reproduced UnmountedRefException
before the fix and passes afterward. The controller is now observed independently
of loading/data rendering, so an open payment dialog retains its controller.
The final rebuilt customer browser check passed: the payment dialog remained open
through the polling interval, simulated settlement succeeded, and the backend
returned the confirmed demo reservation. The confirmation screenshot was inspected
at a 390-pixel mobile viewport with readable content and no horizontal overflow.

Artifacts are ignored local files under `artifacts/`, including customer discovery,
profile, slot and booking-review captures plus portal desktop/mobile/detail/notes
captures. The temporary OTP screenshot was removed; no session token was persisted
by browser evaluation. Synthetic appointment state was adjusted only in the local
validation database to exercise the current-time demo lifecycle.

## Source and phase boundaries

The recorded source inventory contains 32 new and 20 modified files. A targeted
scan of those files found no private-key blocks or live provider credentials.
Environment examples contain placeholders; runtime random secrets are isolated in
ignored validation tooling and removed during cleanup. This is a targeted check,
not a formal security audit. No Git repository exists; none was initialized and
no commit was made.

Cleanup completed: the dedicated customer browser, temporary web/API servers and
isolated PostgreSQL instance were stopped. Temporary runtime credentials and PID
files were removed. Ignored synthetic database/build and screenshot artifacts remain
available locally; they are not source deliverables.

Real SMS, real Razorpay checkout/webhooks/refunds, live consultation connection,
push delivery, approved logo, cloud deployment, physical devices and iOS remain
unvalidated/unconfigured. Consent, retention and clinical auditing require further
production work. No medical outcomes, diagnosis, prescription, compliance or
public-launch readiness are claimed. Phase 4 has not started.
