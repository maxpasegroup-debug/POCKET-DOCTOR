# Staging administrator testing

This is an explicit extension of the existing testing OTP mechanism. It is not production authentication. No phone number, phone hash, OTP, authenticator key or private configuration belongs in Git. No changes to Railway or its database happen when these files are built.

## Required private setup

Use an isolated staging database with test records. An operator must designate the intended testing identity and enroll its authenticator privately. Never reuse production records or production authenticator secrets.

| Variable | Required setting |
| --- | --- |
| APP_ENV | staging |
| NODE_ENV | production |
| OTP_MODE | testing |
| ADMIN_SECURITY_MODE | totp |
| OTP_TEST_ACCOUNTS | Merge the lower-case SHA-256 of the exact normalized +91 identifier with category ADMIN into the existing JSON map. Preserve PATIENT/DOCTOR entries. |
| ADMIN_TOTP_KEYS | Merge the Admin UUID mapped to its private base32 authenticator key into the existing JSON map. Preserve existing keys. |
| DATABASE_URL | Existing isolated Railway staging database; unchanged. |
| SESSION_SECRET | Existing session secret; unchanged. |

The registry accepts at most 50 identities. Any Admin entry with disabled/development Admin security is rejected at startup. Production rejects the testing mode and registry. Runtime request, OTP verification and session restoration recheck the active account, its sole ADMIN role, registry membership and per-user authenticator configuration.

## Account provisioning

Public OTP requests never create an administrator. On the trusted operator shell in the **staging API service**, after deploying this implementation and privately configuring the above settings, supply `TEST_ADMIN_PHONE` and `TEST_ADMIN_USER_ID` as process environment inputs, then run from `/app`:

```sh
npx tsx scripts/provision-testing-admin.ts
```

`TEST_ADMIN_USER_ID` must match the UUID used in `ADMIN_TOTP_KEYS`. For a new dedicated testing identity, generate a new UUID. If the identity already exists as an active administrator, use its existing UUID and authenticator key; do not rotate or replace them. Remove the two operator inputs from the shell after provisioning. They are not needed by the API runtime.

This is a manual database write, never an automatic startup/deploy step. It creates only a missing account with the specified UUID and ADMIN role, and records an operator provisioning audit event. Repeating the exact setup is a no-op. Existing Patient, Doctor, mixed-role, suspended or conflicting accounts are refused without promotion, replacement or reactivation. A failed conflicting setup requires operator review; do not delete or change roles to force it through. The utility is not an HTTP endpoint.

If using a privately prepared setup JSON, its registry/key entries are **entries to merge**, not replacements for the complete existing maps. Keep it outside Git and do not post its contents in support logs. A prepared file does not prove that the corresponding account has been created or that Railway variables have been applied.

## Console login

1. Run/deploy the updated Admin console against the staging API.
2. For a deployed console, use an approved HTTPS console origin included in `CORS_ORIGINS`. The API URL is not the browser origin. For local hosted testing, run `npm run dev:railway -- --port 5173 --strictPort` in `apps/admin-console` and open `http://127.0.0.1:5173`. Vite forwards same-origin `/api/v1` requests to the Railway URL in `apps/admin-console/config/railway-testing.json`. No local backend or database is used. Direct browser requests from HTTP localhost to Railway remain disallowed by its CORS policy.
3. Enter the designated number. The console sends `context: ADMIN` to both `/api/v1/auth/otp/request` and `/api/v1/auth/otp/verify`.
4. Enter the backend-generated staging code shown by the console. No SMS is sent.
5. In the local `dev:railway` console, a valid private `artifacts/staging-admin-private-setup.json` enables automatic completion of the existing authenticator check. No manual authenticator entry is shown. Deployed consoles, preview, other development modes and consoles without that private setup still require the current code from the enrolled authenticator. The existing `/admin/session/elevate` endpoint validates it; incorrect, reused or rate-limited codes fail.
6. Only then does the existing dashboard open. Logout revokes the session; role/status/registry/key revocation and expiry invalidate access.

`TEST_LOGIN_NOT_ALLOWED` now identifies missing staging Admin prerequisites in the console. `ADMIN_LOGIN_NOT_ALLOWED` remains an account authorization failure. Network errors remain distinct. Patient and Doctor registration/login retain their own categories and cannot create Admin access by selecting an Admin context.

### Automatic check on the operator's local testing console

Keep Railway `ADMIN_SECURITY_MODE=totp`. The local helper reads the existing private key on the operator's machine; it never returns the key or authenticator code to the browser. It only accepts sessions from a testing OTP request and verification witnessed by that helper for the exact configured identity with the sole ADMIN role. It revalidates the authenticated identity against Railway before calling the existing MFA endpoint. Provider/development OTP, arbitrary tokens and other accounts cannot use the helper.

The helper uses the time from Railway's authenticated HTTPS response so workstation clock drift does not invalidate the generated code. Missing server time fails closed. There are no automatic MFA retries; the existing backend replay and rate limits apply. If a code has just been used, wait 30 seconds before retrying. Restarting Vite clears the helper's temporary session registry, requiring a fresh sign-in. Its registry is bounded and expires within one hour.

This convenience is enabled only for the loopback Vite server in `railway-testing` mode targeting the configured hosted API. Production builds and preview omit it. Private artifact paths are denied by Vite. Do not copy the private setup into deployed assets, source control or a public server. No backend authentication, Railway variables, database schema or Flutter behavior changes are required.

## Validation

`services/api/test/testing-admin.integration.test.ts` exercises production rejection, explicit provisioning, OTP context isolation/replay, mandatory TOTP, dashboard access, existing account conflicts, suspension, allowlist/key revocation, role changes, logout and expiration on isolated PostgreSQL. `apps/admin-console/test/testing-auth.test.ts` checks request context, preview display and safe error messages. No hosted login or production readiness is implied by local results.

Local validation on 2026-09-15:

- Backend: 206 passed, 0 failed, 1 skipped (`artifacts/testing-admin-backend-final.log`). The opt-in real OS scanner acceptance test was skipped. An earlier run lacked the ephemeral test session secret and failed the existing encrypted-storage test; the final full run supplied that test prerequisite and passed.
- Admin console: 19 passed, 0 failed, 0 skipped.
- Backend build, TypeScript check and Prisma schema validation passed. No schema migration was performed.
- Admin production build passed with the existing Railway API URL verified in its generated JavaScript.
- Source secret scan passed; private setup is Git-ignored and restricted to the current Windows user. No real number or private setup values are in the implementation or tests.
- Railway configuration, account provisioning and hosted account login were not performed. A local test fixture successfully reached the dashboard after both testing OTP and real TOTP validation.

Local console connection validation, also on 2026-09-15:

- Admin suite: 21 passed, 0 failed, 0 skipped; the two additional tests cover development-only forwarding and cross-site/host rejection. The Admin production build passed.
- Real Chromium browser: Railway health returned 200 through the forwarder. Clicking Send verification code received Railway's 400 `INVALID_REQUEST` and displayed the validation message instead of the connection error. This test deliberately substituted an invalid phone payload before transmission, so it could not send SMS, create an OTP challenge, or create an account. A successful real-account login was not tested.
- Forwarding is enabled only by Vite's development server with a configured HTTPS API. It is disabled in production builds and preview. The listener binds to loopback; the target is fixed by operator configuration, TLS verification is enabled, timeouts are bounded, cookies are not forwarded, and foreign browser origins/Host headers are rejected. Railway CORS and authorization are unchanged.

Automatic local testing check validation on 2026-09-15:

- Admin suite: 30 passed, 0 failed, 0 skipped. The additional tests cover witnessed testing sessions, account/role isolation, session revocation/expiry, upstream clock handling, missing server time, transport limits, MFA refusal, production exclusion and malformed local requests.
- Admin TypeScript and production build passed. The production JavaScript was checked against the actual local private key and does not contain it. Requesting the private setup through Vite returned 403.
- Real Chromium login against Railway: OTP request 200, automatic security check 200, dashboard 200, no authenticator input rendered, logout 200 and login screen restored. An initial attempt failed because the workstation clock lagged Railway by approximately 15 minutes; the helper now uses Railway response time. A subsequent request hit the existing OTP cooldown, which was preserved.
- No Railway configuration, deployment, account provisioning or operational data changes were performed. The browser test used the existing staging Admin and created/revoked a normal authentication session. Backend and Flutter files were not changed.
