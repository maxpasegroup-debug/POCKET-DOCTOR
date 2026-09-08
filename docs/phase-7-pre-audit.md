# Phase 7 pre-implementation audit

Inspected 8 September 2026, before Phase 7 source changes. This is a local engineering review, not an independent penetration test or legal assessment.

## Architecture preserved

Flutter uses Riverpod, GoRouter, one package:http API client and platform secure session storage (web sessions are memory-only). Feature repositories cover identity, programs, consultations, wellness commerce, assistant and membership. The doctor portal uses Vite/TypeScript and memory-only bearer sessions. The admin console contains only a README.

The API is a Fastify modular monolith on Node 24, Prisma 7/PostgreSQL. Nine versioned migrations establish identity, content, appointment locking, inventory reservations, assistant records, subscriptions and a shared EnrollmentPayment ledger. SQL constraints and transaction locks protect booking, stock and coupon concurrency. A database trigger creates one receipt per verified payment. No separate payment system should be introduced.

## Existing controls

Opaque random session tokens are hashed in the database; OTPs are random, HMAC-protected and attempt-limited. Server role and ownership checks protect customer resources and assigned-doctor notes. Program/media access requires enrollment and payment or effective membership. HTTP errors are sanitized. Helmet, exact-origin CORS, request IDs and route-pattern-only logs already exist. Development payment, OTP and AI modes are forbidden in staging/production. Assistant prompts cannot execute administrative actions. WhatsApp verifies exact signed bytes and requires app confirmation of account linking.

## Findings and launch blockers

| Severity | Area | Evidence / required work |
|---|---|---|
| HIGH | Authentication | OTP_MODE supports disabled/development only. Production sign-in is unavailable. Admin currently has role checks but no second factor or elevated-session policy. |
| HIGH | Administration | Existing membership/catalogue mutation endpoints lack a central protected audit trail; no administrative user-status controls exist. |
| HIGH | Privacy | User account status, versioned consent, export and access-deletion workflows are absent. Existing assistant deletion and WhatsApp disconnect must be reused. |
| HIGH | Payments | Only DevelopmentPaymentProvider is active. Raw webhook signature utility exists, but real order creation, verified provider events, reconciliation and refunds are not wired into purchase flows. |
| HIGH | Notifications | Appointment reminders and subscription events are separate domain outboxes; no shared delivery worker, retry visibility or outbound transport exists. |
| HIGH | Operations | No deployed service, tested automated backup/restore, alert destination, release signing, real-device or iOS evidence. Railway config automatically runs migrations; require an explicit reviewed release step. |
| MEDIUM | Account lifecycle | Session verification does not check account suspension; WhatsApp account handling also needs this boundary. |
| MEDIUM | Publication | Programs use published boolean; explicit archival and managed curriculum updates must retain purchases/progress. Doctor verification enum lacks REJECTED. |
| MEDIUM | Scaling | Global domain locks are intentional correctness controls but limit throughput. DB pool is five connections; rate limiter is process-local with trustProxy=false. Requires deployment topology and load validation. |
| MEDIUM | CI | Workflow still omits assistant/membership smoke flags and seeds; no admin build exists. |
| MEDIUM | Data retention | Several historical models cascade during privileged database deletion (including receipts). No app hard-delete endpoint exists. Retention and maintenance-role privileges require explicit review. |
| LOW | Documentation | README contains historical statements that later phases have not started. Preserve history but clarify current status. |

## Configuration and debt

Missing production configuration: SMS provider, Razorpay account/keys/webhook, WhatsApp outbound access/version and approved templates, email/push destinations, secure media and storage, monitoring, backup schedule, production origins, domain ownership, signing keys and approved logo. No credentials have been invented. Dependency and full-source secret scans will run during validation; no vulnerability-free claim is made before their results.

No duplicate identity/payment implementation was found. The notification outboxes should feed a single notification service. No uploads are currently accepted, so upload scanning/storage access remains disabled rather than pretending to be secured. Commerce remains a curated wellness catalogue with content approval/eligibility gates. Demo shipping and provider-ready consultation/video are still real launch blockers.

Legal review is required for terms, privacy, medical/AI disclaimers, doctor verification process, product claims, refunds, membership billing, marketing consent and retention. Technical controls cannot establish compliance. Do not use this audit as public-launch approval.

## Execution boundaries

Implement administrative operations, privacy/account controls, protected audit, provider boundaries, notification processing and release safeguards without replacing the completed modules. Validate against an isolated local database, all prior tests and release builds where tooling permits. Do not deploy, send external messages or transact real money during this task. Record configuration and validation blockers explicitly in the final readiness matrix.
