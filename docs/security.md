# Security and privacy — Phase 1

## Implemented controls

- Optional basic wellness interests, name, language and reminder preference only;
  no detailed medical history, diagnoses, prescriptions or clinical data.
- Strict environment validation, ignored environment files and blank secret
  placeholders. Development OTP requires explicit configuration and a private random
  secret, cannot run in staging/production, and binds to loopback.
- Cryptographic per-request OTPs, HMAC hashes, five-minute expiry, five-attempt limit,
  persistent phone cooldown/hourly cap and route IP limits. Database locks prevent
  concurrent replay and resend races. No OTPs or full session tokens are logged.
- Random opaque sessions; SHA-256 hashes at rest; expiry checked per authenticated
  request; logout deletes the server session. No role escalation through client input.
- Secure OS token storage on mobile, Android backup disabled, iOS Keychain setup.
  No insecure-storage fallback. Web preview tokens are memory-only.
- Central 401 expiry handling, protected routes, profile completion gate, startup and
  resume session checks, stale-response guards and local clearing on offline logout.
- Schema-validated auth requests and strict profile allowlists. Caller identity comes
  from session lookup, not request IDs. Errors do not reveal stored OTPs or user records.
- Helmet, bounded bodies/timeouts, exact CORS policy, parameterized Prisma access,
  bounded DB pool, generated request IDs and privacy-conscious operational logging.

The secure-storage 10.x line is used to match the existing SDK 36 Android toolchain;
11.x requires SDK 37. OS-backed storage still needs validation on signed iOS devices.
No production delivery provider or phone ownership verification by SMS is available.

## Explicit operational limits

Seven-day sessions have fixed expiry; refresh rotation is not implemented. Offline
logout clears the local credential but cannot guarantee server revocation without
connectivity. An existing copied token could remain usable until expiry. Do not add
sensitive health workflows before their session/security requirements are reviewed.

Run `npm run auth:cleanup` hourly to delete expired sessions and challenge rows older
than one hour; the app does not provision a scheduler. Expiry checks do not depend
on cleanup. Never use real patient information with development OTP.

IP limits are process-local and trustProxy stays false. Phone limits persist in
PostgreSQL across API replicas. Before SMS delivery, validate trusted proxy configuration,
shared IP abuse limits, delivery quotas, monitoring and incident response. Do not
enable blanket proxy trust or log phone numbers for debugging.

Use separate databases and secrets per environment, HTTPS endpoints, private database
networking/TLS, managed encryption, least-privilege runtime credentials, separately
controlled migration privileges and tested backups. These are deployment obligations,
not claims that cloud infrastructure was provisioned.

## Before adding health data or public access

Define purpose, minimum fields, versioned consent, retention, export/deletion/correction,
doctor assignment, audited access and user revocation. Roles alone must not grant access
to health records, including ADMIN. Keep identity separate from clinical data. Assess
third-party disclosure before media, video, messaging, payments or AI integration.

Privacy and terms screens describe the current preview and clearly mark formal policies
as pending. No regulatory/legal compliance, medical outcome, diagnosis or public launch
readiness is claimed.

## Dependency maintenance

Phase 3 adds patient ownership and assigned-doctor checks for consultations. Private
notes are excluded from patient responses; only completed shared summaries appear.
Doctor writes recheck verification under the scheduling lock. Booking overlap is
also rejected by a database exclusion constraint, independent of UI checks. The
shared payment ledger accepts one purchase target and server-controlled receipts.
Doctor authorization remains enforced by the API after removal of the web portal.
Demo doctors/payments cannot be enabled in deployed environments. See
[Phase 3 privacy and provider boundaries](phase-3.md#records-privacy-and-access).

Prisma's patched deepmerge-ts and mysql2 overrides from Phase 0 remain locked and
tested. Review them on upgrades and remove when upstream dependencies incorporate fixes.
Run npm audit, backend integration tests, Flutter analysis/tests and builds on updates.

## Phase 4 commerce controls

Customer cart/address/order operations require USER role and ownership. Minimal
catalogue, inventory and fulfilment APIs require ADMIN, with no customer role
escalation route. Prices, quotes, order totals, shipping fees and payment/order
states are server-controlled. SQL constraints reject negative/over-reserved stock,
invalid totals and multi-target payments. Transactions serialize final-unit claims,
payment replay and cancellation; order snapshots survive catalogue/address edits.

Restricted or unreviewed products are blocked, including eligibility revoked after
checkout. Demo payment settlement is local-only and reuses the shared provider
receipt contract. Real sales remain disabled until actual payment and shipping
adapters, policy/tax review and provider reconciliation are implemented. No card
details, addresses, phones or payment secrets enter logging or aggregate analytics.
See [Phase 4 operations and limitations](phase-4.md) and its security review.
