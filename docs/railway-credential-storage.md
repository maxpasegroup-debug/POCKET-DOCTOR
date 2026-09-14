# Railway private Doctor credentials

## Status

Implementation prepared; **live Railway storage is NOT enabled or verified by this work**.
No Railway credentials/CLI connection or live service volume configuration was
available. Docker is unavailable locally and WSL is not installed. Linux image,
real ClamAV and Railway restart/redeploy acceptance remain blocked until performed.
Local regression results are recorded below, separately from cloud acceptance.

## Architecture and boundaries

The existing `PrivateCredentialStore` interface and `LocalCredentialStore` are
reused. `DOCTOR_CREDENTIAL_STORAGE=railway-volume` selects the Linux configuration.
`local-test` retains Windows Defender and remains prohibited in staging/production.
No registration, approval, OTP, authorization, Prisma schema or Flutter API
contract changes are required. Both Flutter applications remain separate.

The API must have a Railway **persistent volume mounted at `/data`**. Credential
bytes are written only to:

```text
/data/pocketdoctor/credentials/<sha256-of-objectKey>.enc
```

Metadata remains in the existing PostgreSQL `DoctorCredential` model: Doctor ID,
kind, original filename, MIME type, size, object key and timestamps. No document
binary/base64 column is added. Private reads still pass through the existing
Doctor/Admin authorization routes and return their existing base64 response.
There is no public URL, static route, Cloudinary/S3/Firebase client or new backend.

The unchanged encrypted format is `PDC1` + 12-byte nonce + 16-byte authentication
tag + AES-256-GCM ciphertext, using a 32-byte key and the object key as authenticated
associated data. Filenames are SHA-256 hashes of object keys. Exclusive creation
prevents overwrites. Linux writes sync both file contents and the directory entry.
The same encryption key must survive restarts/redeployments; losing/changing it
without migrating existing ciphertext makes existing files unreadable.

## Linux scanner and private filesystem

The image installs ClamAV and FreshClam. This replaces only the Windows scanner
dependency for Railway mode; scanning is not skipped. Official signatures are
downloaded to `/data/pocketdoctor/clamav`. No credentials/documents are uploaded
to ClamAV: it runs locally in the API container; only signature updates use the
network. FreshClam must reach its official database mirror.

Startup verifies `/proc/self/mountinfo` contains a writable `/data` mount using
ext4/xfs/btrfs, rejects nested replacement mounts and checks the Railway-provided
mount variable. A plain directory, tmpfs or overlay is rejected. Mount evidence
is rechecked on every credential read/write/delete. **This proves an OS mount,
not the ownership or persistence lifecycle of a Railway-managed volume.** The
Railway dashboard volume attachment still requires independent verification.

The Docker entrypoint starts as root only to provision three fixed directories,
rejecting symlinks, then executes the command as `node` (UID/GID 1000). Private
directories are mode 0700; credential files are 0600. It does not recursively
change the volume or expose it through the web server. Do not override/bypass
the entrypoint. The API and worker still run without root privileges.

ClamAV receives a private quarantine file and uses the private credential root
for extracted temporary files. Normal success/failure removes the `.scan` file;
it is plaintext while scanning. An abrupt process/container kill can leave
private quarantine/extraction remnants: these must remain access-restricted and
be handled by a reviewed retention/cleanup procedure, never a public file server.

Signature bootstrap has a 120-second deadline. Updates are required again after
12 hours (checked on upload, 20-second deadline). Upload scanning has a 60-second
deadline and bounds file size, expanded size, recursion and concurrent scans.
An unavailable updater, scan error, infection, encrypted/uninspectable document
or exceeded scan limit returns `PRIVATE_STORAGE_UNAVAILABLE`; no metadata or
successful upload is created. No document contents, keys or scanner output are
logged. Only one scan runs per API process; concurrent uploads receive a retryable
error instead of spawning unlimited scanner processes. Size remains 5 MB.

The health-check startup allowance increases from 60 to 180 seconds for initial
signature download. Provision enough RAM for ClamAV plus Node; measure on the
actual Railway service. Bootstrap timeout, signature download restrictions,
unsupported scanner flags or resource exhaustion must be resolved through image
validation, not by bypassing the scanner.

## Railway dashboard configuration — manual, not yet performed

1. Select the **existing shared backend API service**, whose source root is
   `services/api`. Do not attach the credential volume to PostgreSQL or Worker.
2. Create/attach a **persistent volume** to this API service. Set its mount path
   to **`/data`**. Inspect the deployed environment's volume attachment; a folder
   or manually added variable is not sufficient.
3. Retain root directory `services/api`, config path `/services/api/railway.json`
   (repository-relative, independent of service root), Dockerfile `Dockerfile`
   within the build context, and start command `node dist/server.js`.
4. Set the storage variables below on **API only**. Keep all currently working
   auth/database/OTP settings unchanged. Store the encryption key as a private
   service variable, never Flutter configuration or source control.
5. Worker continues using `railway.worker.json` and `node dist/worker.js`; keep
   `DOCTOR_CREDENTIAL_STORAGE=disabled` there. Do not copy the API's volume mode
   into a shared variable inherited by a worker without a volume.
6. Deploy the reviewed image. Confirm the container executes the entrypoint,
   drops to `node`, has the attached mount and passes `/api/v1/health/ready`.
   The Dockerfile deliberately has no `VOLUME /data` declaration: that would
   not create a Railway-managed persistent volume.
7. Perform the synthetic acceptance below before using real credentials. Retain
   the same volume and encryption key through redeployments. Configure restricted
   volume backups and coordinate them with PostgreSQL backups; volume persistence
   is not a backup or a disaster recovery test.

Railway reference: [volumes, mount variables and permissions](https://docs.railway.com/volumes).
Files outside volumes are ephemeral: [Railway filesystem documentation](https://docs.railway.com/services).

## Required API storage variables

### Startup error: `Invalid environment configuration: DOCTOR_CREDENTIAL_STORAGE`

The current source accepts `railway-volume` in staging and production. During
the startup audit, Git HEAD `e793af7` still contained only `disabled` and
`local-test`; the Railway adapter and entrypoint were untracked local files.
A GitHub deployment of that commit cannot run the new storage mode. Check the
deployment's source SHA, and release **all** related storage files before
redeploying. Changing Railway variables does not upload local code. Do not
commit generated `dist` or private environment files; the Docker build generates
`dist` from source.

The earlier working-copy validator also grouped missing/invalid root, mount,
key, scanner and document-policy settings under `DOCTOR_CREDENTIAL_STORAGE`.
It now reports the exact failing variable name. The volume-provisioning
entrypoint preserves these safe diagnostics too. No secret values are logged,
and none of the required settings or production protections were relaxed.
For example, a missing key reports `DOCTOR_CREDENTIAL_KEY`, while an unknown
mode still reports `DOCTOR_CREDENTIAL_STORAGE`.

The Docker build now explicitly checks executables at `/usr/bin/clamscan` and
`/usr/bin/freshclam`, plus `gosu`. This is a build requirement, not evidence that
the currently deployed image has those binaries. Docker remains unavailable
locally. Keep the persistent volume attachment intact.

Startup-fix validation: **186 passed / 0 failed / 1 skipped** in
`artifacts/railway-storage-startup-tests.log`; build and type-check **PASS** in
`artifacts/railway-storage-startup-build.log` and
`artifacts/railway-storage-startup-typecheck.log`. New regressions prove exact
prerequisite field diagnostics without secret disclosure and safe error output
from the compiled volume entrypoint. Fully configured staging and production
both accept `railway-volume`. Real OS-scanner acceptance remains the one skip.
The deployed SHA/variables were not available, so this audit does not establish
which revision or prerequisite caused the specific hosted failure.

| Variable | Required setting / purpose |
| --- | --- |
| `DOCTOR_CREDENTIAL_STORAGE` | `railway-volume` |
| `DOCTOR_CREDENTIAL_ROOT` | `/data/pocketdoctor/credentials` |
| `DOCTOR_CREDENTIAL_KEY` | Private 32-byte random key, base64 encoded; preserve across deployments |
| `DOCTOR_CREDENTIAL_SCANNER` | `/usr/bin/clamscan` |
| `DOCTOR_REQUIRED_CREDENTIALS` | Existing platform-approved comma-separated required kinds; no new production policy is invented |
| `DOCTOR_REGISTRATION_DEFER_DOCUMENTS` | `false` |
| `RAILWAY_VOLUME_MOUNT_PATH` | `/data`, **injected by Railway after attaching the volume**, not manually faked |

Allowed required kinds remain `QUALIFICATION`, `REGISTRATION`, `IDENTITY`,
`ADDITIONAL`. The synthetic test's `REGISTRATION`-only policy is not a proposed
production policy. Existing `DATABASE_URL`, session/auth settings and deployment
environment variables remain necessary and unchanged. No new SMS/payment setup.

## Test commands and evidence

From `services/api`, using the existing isolated local test database:

```text
npm run build
npm run typecheck
npm run db:validate
npm test
```

The normal suite includes real encrypted-disk upload + real PostgreSQL registration,
owner/Admin download, cross-Doctor and Patient denial, pending/rejected restrictions,
Admin approval, Doctor READY/Home access and suspension. Its scanner is explicitly
a contract double. It checks a second Node process can decrypt the persisted file,
then recreates the backend/database connection and verifies session/document access.
These tests do not prove that Railway attached a volume or that ClamAV ran.

An existing opt-in acceptance test now also accepts `railway-volume`. On a Linux
test host/container with the **actual image, mounted disposable `/data` volume**,
real ClamAV and an isolated loopback PostgreSQL database ending `_test`, set:

- the storage settings above, with test policy `DOCTOR_REQUIRED_CREDENTIALS=REGISTRATION`;
- `APP_ENV=test`, `NODE_ENV=test`, `OTP_MODE=development`,
  `ADMIN_SECURITY_MODE=development`, and valid private test session settings;
- `RUN_LOCAL_CREDENTIAL_STORAGE=true`.

Run `node --import tsx --test test/doctor-local-storage.integration.test.ts` with
the `test` directory mounted/copied into the disposable test image. This explicitly
opted-in test uses actual scanning, not a scanner double. Never run its database
cleanup against Railway or a real-user database. The production image does not
contain test sources by default. The scanner/mount path must not be altered to
make this test pass without a real Linux mount.

Local evidence logs (ignored validation artifacts):

- `artifacts/railway-storage-targeted.log`: initial sandbox worker-launch failure
  (`EPERM`); no application test result.
- `artifacts/railway-storage-targeted-retry.log`: 7 passed, 0 failed, 1 skipped
  before adding the independent-process persistence assertion.
- `artifacts/railway-storage-build.log`, `railway-storage-typecheck.log`,
  `railway-storage-prisma.log`: **PASS** for build (including Prisma generation),
  type-check and Prisma schema validation. No schema changes or migrations.
- `artifacts/railway-storage-backend-tests.log`: **184 passed / 0 failed /
  1 skipped**. This includes the independent-process persistence assertion and
  backend-instance restoration. The skipped test requires the real OS scanner
  and explicitly configured isolated environment.
- Source/config/docs secret scan: **PASS**, 331 files, zero findings (not a
  Git-history/external secret-store audit). `git diff --check`: **PASS**.
- Entrypoint `bash -n`: **PASS** after retrying outside sandbox restrictions;
  this is syntax validation, not execution of the Linux image or root handoff.
- Docker build, real Linux/ClamAV execution, live Railway volume attachment and
  hosted restart/redeploy persistence: **BLOCKED / NOT TESTED**. No Docker CLI,
  installed WSL distribution, Railway CLI or authenticated Railway tool is
  available here. No hosted deployment or production variable change performed.

## Live synthetic acceptance — still NOT TESTED

1. Confirm the Railway dashboard shows the API volume mounted at `/data`, and
   that the running service passes the mount/permission/startup checks.
2. Register a fresh synthetic applicant with the existing authorized OTP flow.
   Upload a harmless synthetic PNG/PDF through the Doctor app. Confirm one private
   `.enc` file under the exact credential root and metadata-only PostgreSQL row.
3. Verify owner/Admin retrieval; unauthenticated, Patient and other-Doctor denial.
   Submit, confirm pending operational denial, then use the existing authorized
   Admin review/approval flow and confirm READY/Home. Check rejection/suspension.
4. Record the synthetic credential ID and file checksum privately. Restart the
   API, then retrieve it through the authorized endpoint and compare bytes.
5. Redeploy the API **retaining the same attached volume and key**. Repeat the
   authorized retrieval/checksum. This is the evidence required for Railway
   redeployment persistence; a successful local write alone is insufficient.
6. Remove the synthetic application/files using the existing reviewed test-data
   cleanup process. Never delete the shared volume as cleanup.

Without the volume, startup refuses Railway mode. If the volume is lost/replaced,
PostgreSQL metadata does not recreate document bytes; reads fail. If the volume
and key are retained, the design supports reads after restart/redeploy, but that
outcome has not yet been demonstrated on the hosted service.
