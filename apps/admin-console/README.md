# Pocket Doctor admin console

Phase 7 operations application, built with Vite + TypeScript and connected to
the existing versioned REST API. There is no
sample data or frontend authority to assign roles, verify payment success, read
clinical notes, inspect AI conversations or mark refunds complete.

## Run and validate

```powershell
cd apps/admin-console
npm ci
Copy-Item .env.example .env.local
npm run dev
npm test
npm run build
```

Set the public `VITE_API_BASE_URL` in `.env.local` or the build environment. Release
builds require an explicit URL; HTTPS is required except on loopback. No API keys,
OTP secrets or authenticator seeds belong in Vite variables. CORS must permit the
console's exact origin. Host the built `dist/` directory with HTTPS and the release
security headers documented at repository level. Hash routes work on static hosts.

## Access

Use an existing ADMIN account; this console cannot grant roles. The normal mobile
OTP flow restores a session, then an additional administrator security check is
required. Production uses a configured authenticator; development security mode
is visibly labeled. A development OTP is displayed only by the Vite development
server when both the API and browser are on loopback. Release builds never render
it. The server must also reject development security in production.

Tokens live only in memory. Refreshing the browser requires signing in again.
Logout clears local state immediately and requests server revocation. Failed
revocation is reported. Requests are aborted/invalidated on session changes, and
stale responses cannot refill signed-out views. A 401 returns to login; the server's
`ADMIN_STEP_UP_REQUIRED` response reopens the authenticator check.

## Workspaces

- Overview: live operational totals, pending worklist and provider readiness.
- People: paginated users, account controls, per-user program/order/consultation/
  membership activity, doctor profiles, verification and availability.
- Care and learning: programs, modules, lessons, live schedules and categories;
  consultation scheduling status and policy-guarded cancellation.
- Wellness: reviewed product information, inventory adjustments, order fulfilment
  and policy-guarded order cancellation.
- Membership and revenue: terms, explicit benefits, coupons, membership history,
  server payment ledger and receipts, refund requests and aggregate revenue reporting.
- Trust and operations: metadata-only AI oversight, WhatsApp receipts,
  notifications, privacy requests, audit trail and secret-free settings.

Forms use human-readable labels and confirmations for changes. Program category
choices paginate, and the doctor selector supports server search and pagination.
Prices are clearly
labeled as integer paise. Existing subscriber terms remain server snapshots.
Resource ID fields are intentional allowlists, not automatic access to all content.
No curriculum or historical record deletion is offered. Privacy fulfilment,
production refunds and provider configuration remain controlled backend workflows.
Payment details include the server-issued receipt. Full refund processing and
status reconciliation require a captured Razorpay payment, the appropriate refund
state, explicit `Refund processing` readiness (`CONFIGURED` or `READY`) and an
operator confirmation. Development payments and pending configuration keep these
controls disabled. The backend independently validates every request; the console
cannot set `REFUNDED` directly or fabricate a tax invoice.

## Source organization

`api.ts`: transport, URL validation, session generation and friendly errors.
`auth.ts`: OTP, ADMIN role check, authenticator and logout UI.
`catalog.ts`: route allowlist and explicit operational table columns.
`dom.ts`: DOM text-node rendering, status components and confirmation dialog.
`forms.ts`: labeled field schemas, parsing and reusable editors.
`pages.ts`: workspaces connected to backend operations.
`availability.ts`: doctor weekly scheduling, timezone and overlap validation.
`main.ts`: responsive navigation, session lifecycle and environment indicator.
`style.css`: Pocket Doctor navy/green tokens, readable tables and mobile layout.

The approved logo asset has not been supplied. The existing plain-text Pocket
Doctor brand is retained; no alternative logo is invented. No external imagery,
fonts, chart libraries or frontend frameworks are added.

The 16 unit tests cover HTTPS configuration, role gating, bearer isolation, expiry,
step-up, stale responses, logout failure, route boundaries, explicit private-field
exclusion, form parsing, doctor availability times/overlaps and provider refund
readiness/lifecycle gating. Browser integration and API authorization tests are
reported with the Phase 7 validation at repository level.
