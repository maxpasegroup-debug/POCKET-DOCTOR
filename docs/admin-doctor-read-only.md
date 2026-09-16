# Admin Doctor details: read-only

Doctor details and scheduling are read-only in the Admin console. This applies to new applications, submitted and reviewed applications, verified/suspended Doctors, and legacy profiles without registration dates.

The console displays professional details, consultation fee, verification state, timezone, weekly availability and excluded dates without profile or scheduling edit controls. The registration review section retains authorized private document downloads, Begin review, Approve application, Request corrections with a reason, and Suspend doctor according to the existing application state.

The Doctor makes corrections through the existing rejected-application correction/resubmission flow. This change does not add profile editing permissions for Doctors or change their existing lifecycle rules.

Backend enforcement:

- `PATCH /api/v1/admin/operations/doctors/:id` returns 403 `DOCTOR_DETAILS_READ_ONLY` for an authenticated, elevated Admin.
- `POST /api/v1/admin/operations/doctors/:id/availability` returns the same denial.
- These legacy mutation routes remain explicit denials so older consoles cannot overwrite records. Existing authentication, Admin role/MFA checks and audit hooks still run.
- Read endpoints, authorized document access and the existing registration review endpoint remain available. No database migration or authentication change is required.

Validation on 2026-09-15:

- Targeted Doctor registration suite: 16 passed, 0 failed, 0 skipped on the existing isolated local PostgreSQL test database. Regressions compare complete Doctor, availability, exception and credential records before/after denied edits; check every application lifecycle state plus legacy profiles; and exercise correction, resubmission, approval, Doctor Home access and suspension.
- Admin suite: 31 passed, 0 failed, 0 skipped.
- Full backend suite: 208 passed, 0 failed, 1 skipped (`artifacts/admin-doctor-readonly-backend-tests.log`). The skipped test requires the real OS credential scanner. The first run using the older development runtime wrapper produced 207 passed, 1 failed, 1 skipped: inherited development provider/document flags added unexpected configuration errors to the compiled volume-entrypoint assertion. Rerunning with neutral process-only test settings passed; no assertion or application configuration was changed.
- Admin production build, backend production build/Prisma generation, and backend TypeScript check passed.
- Chromium checked seven synthetic detail-page states: no profile/schedule inputs or save buttons; professional/schedule data visible; appropriate review controls and private-download actions retained. This was a UI fixture check, not a Railway data mutation.
- Secret scan and whitespace validation passed.

Deployment: the source changes are local. Deploy the updated API for Railway to enforce the restriction against direct requests and older Admin clients. Deploy/rebuild the Admin console for hosted browsers; the running local Vite console picks up the UI change. No Railway deployment was performed as part of this change.
