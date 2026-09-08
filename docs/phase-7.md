# Phase 7 — operations, security and production readiness

Status on 2026-09-08: **local engineering validation; public launch blocked**.
Phase status is **INCOMPLETE** for production launch; the missing engineering,
provider, build and approval gates are listed in the readiness matrix.
This is not a certification, a live-provider acceptance test or authorization to
launch. See [validation](phase-7-validation.md), the [security audit](phase-7-security-audit.md)
and [production runbook](production-runbook.md). Earlier phase documents remain
historical records; this document supersedes their statements about admin and
notification availability.

## System boundaries

The Flutter/Riverpod/GoRouter app, Fastify REST API, PostgreSQL/Prisma schema,
doctor portal and shared payment ledger remain in place. The new TypeScript/Vite
admin console uses the same identity service and versioned API. No second user
database, payment ledger or state-management framework was introduced.

The admin UI provides dashboard counts and readiness, bounded lists, search,
detail forms, confirmations, loading/error/retry/empty states and responsive
navigation. Counts derive from stored records. Live revenue is distinguished
from demo revenue; captured totals are labelled before refunds.

## Operations supported

| Domain | Operations and restrictions |
| --- | --- |
| Users | Bounded directory, profile/role metadata, paginated program/order/appointment/membership activity, suspend/reactivate/deactivate; revoke existing sessions. ADMIN accounts cannot be changed by the routine status action. |
| Doctors | Existing profile, qualifications, specialty, experience, registration metadata, verification state and availability. Verification is an operator assertion following external credential review, not an automated medical credential check. DEMO labels remain. |
| Programs | Categories, draft creation, profile/pricing/publication edits, modules/lessons/live schedules. Curriculum mutations require a draft without enrollments. Archive preserves financial/enrollment records. Archived content is currently removed from customer discovery/access; review the archive policy before withdrawing sold content. |
| Wellness | Existing category/product/safety/inventory controls and membership eligibility. Restricted-product gating is preserved. |
| Orders | Metadata/history, existing sequential fulfilment and cancellation policies, tracking. No raw customer shipping addresses in general admin list/detail DTOs. A real shipping operator integration remains necessary. |
| Appointments | Metadata, cancellation and refund request through existing domain policy. Private doctor notes are not exposed to this console. |
| Membership | Plans, benefits, trials/grace configuration, coupons, lifecycle and existing receipts/revenue. No new recurring mandate is invented. |
| Payments | Ledger/invoice metadata, refund intent, configured provider processing and reconciliation; no client-controlled amount/captured status. |
| Operations | Audit, aggregate AI events, provider events, notifications, privacy review queue and configuration readiness. No raw prompt/message browser in admin. |

## Authentication and authorization

One identity service issues opaque random bearer sessions, storing only their
hashes. Inactive accounts fail authentication. USER sessions last seven days;
ADMIN and DOCTOR sessions last one hour. Mobile retains secure token storage;
portals keep their token in memory and reject stale asynchronous responses.

Every registered `/api/v1/admin/` route, including older commerce/membership
routes, passes the same role and step-up gate. `ADMIN_SECURITY_MODE=totp` uses
per-administrator keys provisioned out of band, 30-second TOTP windows, durable
replay counters and five failed attempts per account per 15 minutes. Successful
step-up lasts 15 minutes. Local development bypass is rejected by deployed
configuration. There is no public role editor or MFA-secret download endpoint.
Successful administrator sign-in creates an `ADMIN_LOGIN` audit event in the
same transaction as session creation, using the server request ID and session
record ID; no OTP, phone number or bearer token is copied into the event.

## API additions

All paths below are under `/api/v1`; requests use strict validated bodies.

| Method/path | Purpose |
| --- | --- |
| GET `/admin/session/status`; POST `/admin/session/elevate` | Administrative step-up |
| GET `/admin/operations/dashboard`, `/settings`, `/metrics` | Counts, readiness, process metrics |
| GET `/admin/operations/:domain`; GET `/:domain/:id` | Explicit domain allowlist, bounded lists/details |
| GET `/admin/operations/users/:id/activity` | `kind=programs/orders/appointments/memberships`, page |
| POST `/admin/operations/users/:id/status` | Account status and session revocation |
| PATCH `/admin/operations/doctors/:id`; POST `/:id/availability` | Existing doctor management |
| POST `/admin/operations/categories`, `/programs`; PATCH `/programs/:id` | Catalogue and publication |
| POST/PATCH program modules, module lessons and live sessions | Draft-only curriculum |
| POST `/admin/operations/orders/:id/cancel`, `/appointments/:id/cancel` | Existing cancellation policy |
| POST `/admin/operations/payments/:id/refund` | Refund request only |
| POST `/admin/refunds/:id/process`, `/:id/reconcile` | Configured provider-confirmed refunds |
| POST `/admin/operations/notifications/:id/retry` | Retry eligible failed delivery; not ambiguous accepted sends |
| GET `/legal/documents` | Versioned policy metadata |
| GET `/me/privacy`; POST `/me/consents` | Owner-scoped choices/evidence |
| POST `/me/privacy/deletion` | End access and queue retained-record review |
| GET `/me/export` | Owner-scoped paginated export |
| GET `/me/notifications`; POST `/:id/read` | Unified personal inbox |
| POST `/payments/razorpay/webhook` | Signed, idempotent provider event inbox |

Existing domain APIs remain documented in Phases 0–6. New exports cover profile,
program enrollment, order/membership/appointment metadata, memories,
conversations/messages, goals, check-ins, reminders, addresses and consents.
They intentionally exclude authentication secrets and private doctor notes.
Flutter offers selectable page-by-page JSON; a packaged downloadable archive and
formal fulfillment workflow are not implemented.

## Data and consent

Four additive migrations extend the nine existing migrations. Added models:
`AdminAuditEvent`, `AdminElevation`, `AdminMfaCounter`, `ConsentRecord`,
`PrivacyRequest`, `Notification`, `ProviderEvent`, `RequestBudget`. User gains
account status; Program gains archive time; doctor verification gains rejection.

Consent records store type, version, grant/revocation and time. Marketing is
separate from service communications, AI processing and WhatsApp. Profile and
assistant preference changes also create the relevant consent evidence.
Unapproved/missing legal documents cannot be accepted as approved terms.

Deletion is deliberately named **delete account access**: it revokes sessions,
blocks login, disconnects WhatsApp, disables external queued delivery and creates
a privacy review request. It does not pretend that retained invoices,
consultations, audit records or all health data have been erased. Financial and
medical retention periods require approved policy. Append-only consent evidence
has no identity-deletion cascade; it contains an internal user UUID, not phone
numbers or health content.

## Notifications and worker

`Notification` is the unified inbox/outbox, referencing existing domain event
identifiers with unique source keys. The worker collects program status,
appointment status/reminders, order events and receipt/membership updates.
Messages use generic wording without product titles, diagnoses or private notes.
Existing personal wellness reminder management remains available separately.

`node dist/worker.js` runs bounded cycles with shared database locks and durable
state. `--once` is useful for operational checks. It cleans expired auth/budget
records, commerce holds and membership lifecycle states. It does not delete
health records under an invented retention policy.

WhatsApp outbound is opt-in and disabled by default. The Cloud API adapter sends
only a generic app-update message after checking active account, service
preference, linked number, explicit consent and an open 24-hour inbound window.
SENT means provider acceptance; signed status callbacks establish delivered/read.
Uncertain requests become UNKNOWN and are not automatically resent. Failed
unaccepted sends use bounded backoff; exhausted attempts become DEAD_LETTER.
Accepted provider references are not retried blindly. No promotional templates,
out-of-window campaigns, push or email provider is enabled. Conversational AI
WhatsApp replies remain unavailable; notification configuration does not imply
that chat delivery works.

## Payments and refunds

The fixed-origin Razorpay adapter creates orders and verifies captured payment
ID/order/amount/currency and checkout signatures. Refunds persist intent before a
money-moving request, do not retry uncertain POSTs, and only mark REFUNDED after
fetching a matching provider-confirmed refund. Historical membership charges
require a separate review so they cannot silently remove a later paid term.

Signed webhooks validate exact raw bytes and supported event/reference metadata;
unique provider/event IDs reject conflicting replay and prevent duplicates.
They are stored as `RECONCILIATION_REQUIRED`, not treated as proof of fulfillment.
**The adapter is not yet wired into live customer checkout or recurring
subscription settlement.** Adding credentials alone does not complete those
flows. Domain receipt/fulfillment integration, provider sandbox acceptance and
later live verification remain launch blockers. No live funds were moved.

## Run and validation

1. Configure the API using [production-config.md](production-config.md), using
   development settings only in an isolated local database.
2. From `services/api`: `npm ci`, `npm run build`, review migrations, then
   `npm run db:deploy`, `npm run db:check`, `npm run dev`.
3. From `apps/admin-console`: `npm ci`; set `VITE_API_BASE_URL`; `npm run dev`.
   Provision the ADMIN role through a controlled database/operator process.
   There is no default administrator password, OTP or embedded TOTP secret.
4. Start `npm run worker` in a separate process. Keep external sending disabled
   until provider and consent acceptance tests have been approved.
5. Flutter: use existing development defines; Privacy & account and Notifications
   are under Settings. See the validation document for all smoke flags/builds.

## Known limitations

Production SMS, live checkout/recurring settlement, secure program media, live
consultation provider and shipping operations still need implementation and/or
provider acceptance. Provider credentials, DNS/TLS, actual deployment, external
monitoring/alerts, encrypted off-site backups, approved logo/store identities,
Android signing, iOS/device testing and business/legal approval are unavailable.
The local audit is scoped engineering validation, not independent penetration
testing, clinical review, load certification or legal compliance.
