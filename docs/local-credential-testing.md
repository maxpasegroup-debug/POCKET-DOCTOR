# Existing local encrypted credential storage — testing setup

## Result and blocker

The existing adapter is configured in an opt-in local profile. **Actual uploads
are blocked on this machine because Windows Defender scanning is disabled.**
No scan bypass, alternative provider, public file endpoint or document deferral
was introduced. This adapter is not production storage.

On 14 September 2026:

- `Get-MpComputerStatus` reported AM service, antivirus and real-time protection
  disabled. A real `MpCmdRun.exe` custom scan of a harmless synthetic PDF exited
  **2**, reporting **0x80004005**.
- A real configured-adapter API acceptance test completed registration OTP,
  saved a draft, rejected submission without a document, and blocked Doctor
  operations. The document upload returned **503 PRIVATE_STORAGE_UNAVAILABLE**.
- The acceptance test did not proceed to submission/approval after that failure.
  Those steps must not be represented as passing with real scanned storage.

## What already existed

`services/api/src/modules/doctor-registration/local-store.ts` contains
`LocalCredentialStore`, `defenderScanner`, and `configuredRegistration`.
It requires a private ACL-protected directory, scans quarantined bytes with the
real Defender executable, checks that scanning did not alter the bytes, then
stores AES-256-GCM ciphertext with object-key-associated authentication data.
Random nonces and exclusive file creation prevent overwrites. Object keys are
hashed into filenames; reads go through existing authenticated endpoints.
Quarantine files are removed on success/failure. Storage does not publish URLs.

Uploads were disabled because neither root nor API `.env` was present and the
existing `DOCTOR_CREDENTIAL_STORAGE` default is `disabled`. A required-document
policy is also mandatory for non-deferred submission.

## Local profile provisioned

Private profile: `%LOCALAPPDATA%\PocketDoctor\credential-test\backend.env`

Private files: `%LOCALAPPDATA%\PocketDoctor\credential-test\files`

Both directories have protected ACLs allowing the current Windows user and
SYSTEM. They are outside this repository and OneDrive. The configuration holds
a generated 32-byte encryption key and a separate generated session secret;
neither is included here or in source control. Do not delete/rotate the storage
key while its encrypted documents are needed.

| Variable | Local setting / purpose |
| --- | --- |
| `APP_ENV`, `NODE_ENV` | `development` |
| `HOST`, `PORT` | `127.0.0.1`, `3018`; matches existing Doctor IDE launch profiles |
| `DATABASE_URL` | Existing isolated loopback `_test` database; no Railway data |
| `SESSION_SECRET` | Generated private value, not printed |
| `OTP_MODE` | Existing `development` OTP, localhost only; no SMS |
| `ADMIN_SECURITY_MODE` | Existing `development` mode; ADMIN role still required; no admin account provisioned by setup |
| `DOCTOR_CREDENTIAL_STORAGE` | `local-test` |
| `DOCTOR_CREDENTIAL_ROOT` | Private files directory above |
| `DOCTOR_CREDENTIAL_KEY` | Generated 32-byte base64 key, not printed |
| `DOCTOR_CREDENTIAL_SCANNER` | Installed Defender `MpCmdRun.exe`, platform version `4.18.26060.3008-0` |
| `DOCTOR_REQUIRED_CREDENTIALS` | `REGISTRATION`, matching the existing integration-test policy; not a production review policy |
| `DOCTOR_REGISTRATION_DEFER_DOCUMENTS` | `false`; a document is required |
| Payment / AI / SMS / email / push / WhatsApp / demo catalogues | Disabled in this profile |

The default backend/Railway environment was not overwritten. Load this profile
explicitly in a **local development PowerShell terminal**, after restoring a
working Defender scanner:

```powershell
cd 'C:\Users\kkyad\OneDrive\Desktop\pocket doctor\services\api'
$env:DOTENV_CONFIG_PATH = Join-Path $env:LOCALAPPDATA 'PocketDoctor\credential-test\backend.env'
npm run dev
```

Dotenv preserves already-set process variables. Use a fresh local terminal with
no production environment overrides. Do not copy this profile to Railway, change
the deployed service to development mode, or disable another security product to
make the test pass. Recheck the configured scanner path after Defender upgrades.

## Doctor client inspection

The separate Doctor project is unchanged. Its registration repository already
POSTs base64 bytes, filename, MIME type and kind to
`/api/v1/doctor/registration/documents`, with a 90-second upload timeout. The UI
reads `storageAvailable`, `requiredKinds` and `deferred` from the backend policy.

Existing `.vscode/launch.json` profiles already target port 3018. Use that local
profile instead of a Railway build for local files:

```powershell
# In the separate Doctor Flutter project, for an Android emulator:
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3018/api/v1 --dart-define=SHOW_DEVELOPMENT_OTP=true
```

For a USB device, use its existing USB launch profile and `adb -d reverse
tcp:3018 tcp:3018`. No Flutter source change is required.

## Authorization and production safety

The existing registration routes remain unchanged. Owner and Admin document
downloads stay authenticated and ownership-scoped. The database models,
registration lifecycle, patient authentication and Admin review logic are
unchanged. Actual states are `DRAFT` → `SUBMITTED` / `PENDING_VERIFICATION` →
`UNDER_REVIEW` → `VERIFIED`; only approval enables `READY` and operations.
Rejection allows the existing correction workflow; suspension blocks operations.

The existing global environment validator already rejects production/local
runtime mismatches, and rejects `local-test` for staging/production. A matching
`NODE_ENV=production` check was added directly to the adapter factory as defense
in depth for constructed configuration objects. Fully populated configuration
regressions ensure production rejection is not merely caused by missing keys.
This local-test mode still fails closed in production. A separate, opt-in
Railway volume mode is now documented in [railway-credential-storage.md](railway-credential-storage.md);
it does not make this Windows development profile suitable for deployment.

## Real-adapter acceptance command

After enabling the actual scanner, from the API directory with the private
profile selected as above:

```powershell
$env:RUN_LOCAL_CREDENTIAL_STORAGE = 'true'
node --import tsx --test test/doctor-local-storage.integration.test.ts
Remove-Item Env:RUN_LOCAL_CREDENTIAL_STORAGE
```

This opt-in test requires loopback `_test` PostgreSQL, local development OTP,
the real configured scanner, and non-deferred documents. It creates synthetic
accounts, verifies encrypted bytes and document ownership, exercises authorized
review/rejection/resubmission/approval and Doctor access, then checks suspension.
It removes only its own records/files. It never substitutes a scanner double.
Ordinary backend runs skip this platform-dependent acceptance test.

## Evidence

- `artifacts/credential-scanner-probe.log`: actual scanner failure.
- `artifacts/credential-real-storage-test.log`: 0 passed / 1 failed / 0 skipped;
  real upload blocked, not a successful storage claim.
- Existing storage unit tests use an explicit scanner contract double to test
  encryption/tampering/permissions. Existing registration integration tests use
  a storage contract double to test lifecycle and authorization on PostgreSQL.
  Their results are separate from real scanner acceptance.
- Full backend regression: **177 passed / 0 failed / 1 skipped** in
  `artifacts/credential-backend-tests.log`. The skip is the opt-in real-scanner
  acceptance test; its separately executed failure is reported above.
- Backend build (including Prisma generation): **PASS**, recorded in
  `artifacts/credential-backend-build.log`. Type-check: **PASS**, recorded in
  `artifacts/credential-backend-typecheck.log`.
- Existing PostgreSQL registration tests passed for private document ownership,
  authorized Admin review, pending/rejected restrictions, approval to READY and
  suspension. These use a storage contract double, not the failed OS scanner.
- Source/config/document secret scan: **PASS**, 326 files, zero findings;
  this is not a Git-history or external secret-store audit. `git diff --check`
  passed. The private storage folder contained zero files after the failed
  acceptance test, confirming its quarantine file was cleaned up.

Overall: **PARTIAL**. Restore a working Defender scanner on the development
machine, then rerun the real-adapter acceptance command before claiming the
complete upload-to-approval flow works with local encrypted storage.
