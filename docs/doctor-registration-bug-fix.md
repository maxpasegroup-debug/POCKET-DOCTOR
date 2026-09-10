# Doctor registration investigation — 2026-09-10

## Evidence before changes

The Doctor client is `../Pocket Doctor Doctor`. Its configured API is the shared
backend in this repository (`services/api`), served locally on port 3018.
No backend is created in the Doctor project.

Actual registration path:
`LoginScreen.submit(registration: true)` → `AuthRepository.requestOtp` →
`POST /api/v1/doctor/registration/otp/request` → `IdentityService.requestOtp`
with server-selected purpose `DOCTOR_REGISTRATION` →
`prisma.user.findUnique({where: {phone}, include: {roles: true}})`.

The exact rejection is `existing && !existing.roles.some(r => r.role === 'DOCTOR')`.
It returns HTTP 403 / `REGISTRATION_NOT_ALLOWED`. The Doctor client's
`lib/core/networking/api_client.dart` translates that code into
“This account cannot register as a new doctor. Contact the platform team.”
There is no Doctor lookup, invitation, profile or verification requirement before
this rejection. A number with no User record is eligible.

A live HTTP probe against port 3018, using synthetic numbers checked absent in
PostgreSQL, confirmed before modification:

- Fresh registration request: 200; no User created before verification.
- Fresh registration OTP verification: 200; server-created DOCTOR applicant.
- Ordinary `/auth/otp/request` + `/auth/otp/verify` for a second fresh number:
  200, creates USER.
- Registration for that second number: 403 `REGISTRATION_NOT_ALLOWED`.

The Doctor client's non-registration sign-in uses ordinary shared login, which
silently creates a Patient identity for an unknown number. This reproduces the
reported blocking mechanism. The reported rejection for an actually absent User
was NOT reproduced; the specific user's number/history has not been inspected.

## Existing policy and constraints

User.phone is unique; Doctor.userId is unique; UserRole has a composite primary
key. Registration verifies a purpose-bound OTP, upserts one Doctor with
`PENDING_VERIFICATION`, and leaves existing Doctor state unchanged. Submission
becomes SUBMITTED/UNDER_REVIEW; only authorized Admin approval sets VERIFIED.
Operational consultation APIs require DOCTOR and a VERIFIED Doctor profile.

The schema can represent multiple roles, but existing registration code AND
PostgreSQL regression tests explicitly prohibit self-registration for an existing
USER-only account. Preserve that policy; do not infer a dual-role registration
policy from schema capacity. Do not convert or delete real existing accounts.

## Targeted correction

Add optional Doctor sign-in context to the existing shared OTP endpoints. The
server applies stricter account lookup using the SAME LOGIN purpose, OTP service,
hashing, rate limits, attempts, sessions and storage. Unknown numbers receive a registration
instruction without creating USER; existing non-Doctors remain blocked. The
default Patient/Admin login contract remains unchanged. Doctor registration
continues using its existing endpoints. No schema migration or storage change.

## Changes delivered

- `services/api/src/modules/auth/identity-service.ts`: Doctor sign-in checks that
  the account exists, is active and has DOCTOR before issuing an OTP; verification
  rechecks the role and uses lookup rather than account creation. Unknown numbers
  receive `DOCTOR_REGISTRATION_REQUIRED`. Registration eligibility stays unchanged.
- `services/api/src/modules/auth/routes.ts`: optional `context: "DOCTOR"` on the
  existing login endpoints selects that restrictive path. Omitted context retains
  Patient/Admin behavior. It never selects or assigns a role.
- `services/api/test/doctor-registration-entry.integration.test.ts`: new real
  PostgreSQL tests cover the reproduced bug and registration/approval boundaries.
- Separate Doctor client: `lib/features/auth/auth_repository.dart` sends Doctor
  context only for login, `lib/core/networking/api_client.dart` handles the two
  actionable login errors. `test/contracts_test.dart` validates context and
  `test/registration_entry_test.dart` exercises entry recovery and blocked errors.

No Patient UI, Admin source, database schema, storage provider, existing OTP
rate limit, or verification rule was changed by this fix. Pre-existing uncommitted
registration files in this repository were retained. No Git commit was created.
The existing `OtpChallenge_purpose_check` constraint remains unchanged: Doctor
sign-in stores LOGIN, while registration stores DOCTOR_REGISTRATION.

The local runtime also had inconsistent document deferral: Doctor API 3018 enabled
it, Admin/Patient API 3007 omitted it. The ignored local development runtime
`artifacts/db-tooling/phase7-runtime.json` now sets the existing
`DOCTOR_REGISTRATION_DEFER_DOCUMENTS=true` flag, matching API 3018. This is needed
for the Admin panel to approve the same development applications without documents.
No production configuration or storage validation was changed.

## Validation evidence

| Check | Result |
| --- | --- |
| Doctor Flutter analyze | PASS, no issues |
| Doctor Flutter tests | 41 passed, 0 failed, 0 skipped |
| Doctor Android debug APK | PASS, USB localhost port 3018 configuration |
| Backend build and typecheck | PASS |
| Prisma validate | PASS; no migration required |
| Backend `npm test`, final default run | 162 passed, 0 failed, 0 skipped |
| Backend full serial run | 162 passed, 0 failed, 0 skipped |
| Patient full Flutter suite | 82 passed, 0 failed, 7 opt-in smoke tests skipped |
| Patient real HTTP auth smoke, enabled separately | 1 passed, 0 failed, 0 skipped |
| Admin tests | 16 passed, 0 failed, 0 skipped |
| Admin production build | PASS |
| Whitespace/diff check | PASS |

The first default backend run, concurrent with builds, had 125 passes, 10 failures
and no skips (some parent failures prevented remaining subtests). Failures included
database connection/query timeouts, timing-dependent checks and local credential
storage validation under load. No assertions were removed or weakened. Both the
complete serial run and a subsequent run of the exact default `npm test` command
passed all 162 tests once builds finished. Evidence is retained in ignored
`artifacts/doctor-registration-backend-tests.txt`,
`artifacts/doctor-registration-backend-tests-serial.txt` and
`artifacts/doctor-registration-backend-tests-final.txt`.

Live HTTP + PostgreSQL acceptance passed using fresh synthetic accounts:
Doctor sign-in directs registration without creating USER → registration OTP →
basic/professional details → deferred-document submission (SUBMITTED) → pending
operational access denied → unauthorized approval denied → authorized Admin
approval → logout → normal resend cooldown → new Doctor OTP login → READY →
profile, agenda and availability APIs succeed. Admin access remains denied to the
Doctor. Synthetic HTTP accounts and OTP challenges were cleaned. Evidence:
`artifacts/doctor-registration-live-results.json`.

The additional live acceptance on the Admin API address (3007) passed registration,
OTP, details, pending restrictions and Admin approval, but the subsequent OTP
request after the resend cooldown returned HTTP 500 / INTERNAL_ERROR twice.
Local PostgreSQL connection timeouts were also observed during diagnostics and
cleanup. The interrupted first attempt's synthetic records were subsequently
removed by verified fixture IDs; the second attempt completed its cleanup.
Evidence: `artifacts/doctor-registration-admin-live-attempt1.json` and
`artifacts/doctor-registration-admin-live-attempt2.json`. After stopping the idle
Gradle daemon from the completed Android build, the final full Admin-address retry
passed, including a new Doctor OTP login, READY, Home APIs and Admin isolation.
Its synthetic records were cleaned. Final evidence:
`artifacts/doctor-registration-admin-live-results.json`. Earlier failures remain
recorded; reduced-load success is not proof of long-running runtime stability.
No database timeouts or authorization assertions were relaxed to conceal failures.

New backend coverage also confirms same-application recovery for pending,
rejected, verified and suspended Doctors; rejection permits correction and
resubmission; suspension cannot be bypassed. Existing ownership/consultation tests
passed in the complete backend suite.

Physical-device acceptance is currently BLOCKED: the APK installed successfully
on the connected Android device, but screen inspection subsequently reported
`showing=true`, `mIsShowing=true`, `mInputRestricted=true` and screen off. The user
has been asked to unlock the device. UI automation did not complete registration;
installation or API/widget tests are not evidence of physical end-to-end success.
No synthetic device applicant was successfully created. Temporary synthetic device
fixtures were checked and cleaned; no real account was converted or deleted.

## Limits and next step

- Preserve existing Patient-only registration restrictions. Existing affected
  accounts need platform review; they were not converted or deleted.
- The original report's specific number was not inspected. A database-confirmed
  absent number succeeded before and after the fix; the reproducible failure was
  ordinary Doctor sign-in creating USER before a later registration attempt.
- Finish physical UI acceptance after device unlock. No iOS validation performed.
- Watch the intermittent local PostgreSQL timeouts during physical acceptance;
  the final full live runs on both API addresses passed, but earlier failures
  under local resource pressure remain recorded.
- Development document deferral remains development-only. This is software flow
  validation, not production readiness or verification of professional credentials.
