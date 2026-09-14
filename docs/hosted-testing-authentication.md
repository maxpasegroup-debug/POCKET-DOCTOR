# Hosted staging authentication

## Scope and deployment

This extends the existing `OTP_MODE=testing` challenge/session mechanism. No SMS integration, separate login system, database migration, storage change, or automatic Doctor approval is introduced.

Deploy the backend changes before configuring the private test identity map. The running Railway service is not updated by editing this repository. Neither a Railway deployment nor a Railway account creation was performed during this change.

Use an isolated staging database containing synthetic records only. Phone hashes are an eligibility list, not proof that a phone belongs to a synthetic person, and are not passwords. An operator must verify each identity is reserved for testing before adding it. Never allowlist real patient, doctor, or administrator identities or reuse a production database.

## Backend configuration

Keep `APP_ENV=staging`, `NODE_ENV=production`, and `OTP_MODE=testing`. Add the private server environment variable `OTP_TEST_ACCOUNTS`:

```text
{"<SHA-256 of normalized synthetic Patient phone>":"PATIENT","<SHA-256 of normalized synthetic Doctor phone>":"DOCTOR"}
```

Replace the placeholders with lowercase 64-character SHA-256 hashes of exact normalized `+91` phone identifiers, with no spaces. The map accepts at most 50 entries. One identifier belongs to one test client category. Empty/default `{}` rejects every testing login. Invalid JSON, unsupported categories (including ADMIN), malformed hashes, and maps enabled outside staging/test or outside testing OTP mode fail startup.

Keep the map and the test identifiers private. Do not put them in Flutter configuration, source control, screenshots, or logs. No fixed phone number, universal OTP, or shared test password is supplied in this repository.

To generate the map locally in PowerShell without displaying the phone identifiers:

```powershell
$testIdentities = @{}
$testHasher = [Security.Cryptography.SHA256]::Create()
try {
  foreach ($testKind in @('PATIENT', 'DOCTOR')) {
    $testInput = Read-Host "Reserved synthetic $testKind phone in +91 format" -AsSecureString
    $testPhone = [Net.NetworkCredential]::new('', $testInput).Password
    if ($testPhone -notmatch '^\+91[6-9][0-9]{9}$') { throw 'Use the normalized synthetic identifier' }
    $testHash = [BitConverter]::ToString($testHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($testPhone))).Replace('-', '').ToLowerInvariant()
    if ($testIdentities.ContainsKey($testHash)) { throw 'Patient and Doctor must be separate synthetic identities' }
    $testIdentities[$testHash] = $testKind
    $testPhone = $null
    $testInput.Dispose()
  }
  $testIdentities | ConvertTo-Json -Compress
} finally { $testHasher.Dispose(); $testPhone = $null }
```

Paste only the resulting private map into Railway's API service variable `OTP_TEST_ACCOUNTS`. Keep all existing storage variables, volume mount and encryption key unchanged. Do not enable development OTP, document deferral, or development Admin security on Railway.

## Patient behavior

The identifier must be configured as PATIENT. A new identifier uses the existing normal Patient provisioning after successful OTP verification. An existing account must be ACTIVE with exactly the USER role. Doctor, Admin, mixed-role and suspended accounts cannot authenticate through this route.

`POST /api/v1/auth/otp/request` returns the existing random six-digit testing preview. `POST /api/v1/auth/otp/verify` consumes the challenge once and creates the existing opaque session. The client restores it through `/api/v1/auth/session`. Logout revokes it. Preview sessions expire after one hour.

## Doctor behavior

The identifier must be configured as DOCTOR. Sign-in continues to send `context: DOCTOR` to the shared OTP endpoints. An existing active account must have exactly the DOCTOR role, a linked non-demo Doctor profile, VERIFIED state, and complete name, qualification, specialty, biography and languages. Adding a map entry does not assign a role, approve a Doctor, or fill their profile.

An explicitly configured new Doctor identifier receives the existing `DOCTOR_REGISTRATION_REQUIRED` response on sign-in and must choose registration. It never becomes a Patient via Doctor sign-in.

Registration continues through `/api/v1/doctor/registration/otp/request` and `/verify`. It creates or recovers the existing pending application. Applicants can save details, upload credentials and submit. Pending/rejected applicants can recover their application and correct/resubmit where allowed; they cannot sign in to Doctor operations. Suspended/inactive Doctors cannot obtain or restore a testing session.

Credential policy, storage, ownership and review are unchanged. Real credential uploads on Railway still depend on its existing private volume/scanner configuration. No document bypass is enabled.

Only existing authorized Admin review can approve an application. Approval is verified again before Doctor sign-in and operational access. Sessions restore through `/api/v1/doctor/session`; a verified complete profile returns READY. Doctor-only and Admin API authorization remains server controlled.

## Admin limitation

This change deliberately does not add Admin preview authentication. With `OTP_MODE=testing`, Admin identities cannot obtain testing sessions. `ADMIN_SECURITY_MODE=disabled` also disables administration. Simply setting TOTP mode does not solve the missing first-factor Admin session.

Consequently, an already approved synthetic Doctor can test Doctor sign-in after deployment/configuration, but a new hosted application cannot complete Admin approval until an authorized operational Admin access path is available. Do not manually promote the application in SQL or disable authorization to work around this. The automated registration/approval regression uses the existing local Admin development authentication on an isolated local test database, not a hosted Admin bypass. Hosted end-to-end approval remains unverified.

## App configuration and testing

Both hosted profiles target `https://pocket-doctor-production.up.railway.app/api/v1`:

- Patient: `apps/mobile/config/railway-testing.json`, with APP_ENV staging and testing preview enabled.
- Separate Doctor project: `config/hosted-testing.json`, with the same API URL and preview enabled. The Doctor client currently reads the explicit API URL and preview flag, not APP_ENV; the backend enforces staging eligibility.

Local launch profiles remain available. Preview is debug-only in the existing clients. Build/run from each Flutter project directory:

```text
Patient (apps/mobile): flutter run --dart-define-from-file=config/railway-testing.json
Doctor (separate project): flutter run --dart-define-from-file=config/hosted-testing.json
```

1. Deploy these backend changes and configure the private map using your existing reserved synthetic Patient and Doctor identifiers. No actual Railway test identifiers were verified or provisioned in this change.
2. Patient: enter the configured Patient number, request the code, enter the displayed testing code, and continue the existing profile/Home flow.
3. Doctor: use the configured, already approved synthetic Doctor number. Verify the displayed code and confirm Doctor Home loads.
4. For new Doctor testing, use another explicitly configured synthetic DOCTOR identifier and choose Register as Doctor. Complete details/documents and submit. Confirm pending state and blocked operational access. Complete approval only through existing authorized Admin review when that operational dependency is available, then sign in again.
5. Restart each app to check restoration; log out and confirm protected screens require sign-in. Try an unlisted number, wrong client, and pending/suspended Doctor to confirm rejection.
6. Request fresh codes after deploying: testing challenges are now purpose-bound. Removing an identity from the map invalidates its testing sessions on the next authenticated request.

## Security and evidence boundaries

Testing OTP hashes are separated from real OTP mode and bound to Patient login, Doctor login or Doctor registration. Existing expiry, attempts, resend limits, replay protection, session hashing and logout remain. Eligibility/role/status checks run before challenge issuance, during verification and on session restoration. No client field can set a role/status or approve registration.

Production rejects `OTP_MODE=testing`, development OTP and nonempty test identity maps. Enabled production login continues to require the existing real provider path; disabled OTP leaves login unavailable. Provider/SMS code is unchanged.

Regression evidence is recorded in the task report. Backend tests use real isolated PostgreSQL; the new authentication suite substitutes only the private-storage transport with a contract test double. No Railway persistence or real SMS delivery claim follows from these tests. Flutter tests cover client behavior without claiming physical-device acceptance.

## Validation — 2026-09-14

| Check | Result | Local evidence |
| --- | --- | --- |
| Full backend suite, final rerun | 195 passed, 0 failed, 1 skipped (196 total) | `artifacts/hosted-auth-backend-tests-rerun.log` |
| Backend build and Prisma generation | PASS | `artifacts/hosted-auth-build.log` |
| Backend type-check | PASS | `artifacts/hosted-auth-typecheck.log` |
| Patient Flutter suite | 98 passed, 0 failed, 7 skipped | `artifacts/hosted-auth-patient-tests.log` |
| Patient Flutter analysis | PASS | `artifacts/hosted-auth-patient-analyze.log` |
| Separate Doctor Flutter suite | 46 passed, 0 failed, 0 skipped | `artifacts/hosted-auth-doctor-tests.log` |
| Separate Doctor Flutter analysis | PASS | `artifacts/hosted-auth-doctor-analyze.log` |
| Source/config/document secret-pattern scan | PASS, no findings | `node ops/scan-secrets.mjs` |
| Live Railway health and readiness | HTTP 200 for both existing endpoints | Read-only GET checks; not authentication acceptance |

The first full backend run recorded 194 passed, 1 failed, 1 skipped: an unchanged encrypted-storage read returned 503 during a roughly 27-minute execution pause. The complete rerun passed without changing storage code or tests. The one backend skip is the opt-in real OS-scanner acceptance test. The seven Patient skips are opt-in live API smoke tests without their required setup; they were not converted to mocks or deleted.

The nine additional backend test cases cover allowlist validation, unlisted identities, Patient isolation, pending-only registration, credential ownership, rejection/recovery/authorized approval, verified sign-in/restoration/logout, and status/configuration revocation. The existing testing OTP suite still covers attempts, expiry, replay, provider-mode isolation and client role spoofing.

No schema migration, Railway data write, Railway environment change, deployment, commit or push was performed. Temporary local integration fixtures were cleaned by test teardown. Hosted Patient/Doctor sign-in and hosted Admin approval have not been accepted against the new code. Physical devices and real SMS were not tested.
