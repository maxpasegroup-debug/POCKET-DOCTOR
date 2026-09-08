# Phase 7 security audit

Review date: 2026-09-08. Scope: local source, isolated PostgreSQL integration
tests, Flutter/portal tests and scoped admin browser QA. This is an engineering
review, not an independent penetration test or a compliance certification.

## Controls verified

| Boundary | Evidence |
| --- | --- |
| Authentication | Existing OTP validation, attempt limits, replay/expiry/logout tests retained; inactive users fail session verification; privileged sessions shortened to one hour |
| Administrative privilege | All registered admin endpoints share role and step-up enforcement, including earlier commerce and membership routes; unauthorized role and missing/expired MFA tests pass |
| MFA | RFC 6238 reference vector, persistent replay counters, cross-IP failed-attempt budget; no committed account keys |
| Input / mass assignment | Strict Zod schemas reject client roles, prices, payment results, negative amounts and malformed identifiers; explicit administrative forms |
| Ownership | Existing programs/appointments/orders/membership/AI tests plus owner-scoped privacy exports and notification read state |
| Private doctor records | Patient and general admin DTOs omit private notes; assigned-doctor access remains separate |
| Payments | Existing simulated settlement keeps server prices/ownership; Razorpay adapter tests reject order/amount/currency mismatch, invalid signatures and uncertain responses |
| Refunds | Persistent intent precedes external POST; ambiguous failures cannot trigger a second POST; matching provider confirmation alone produces REFUNDED |
| Webhooks | Exact raw-body signatures, supported event/reference validation, conflicting replay rejection, durable idempotent receipts; no fulfillment from an unchecked callback |
| Notifications | Consent/window checks, provider acceptance distinct from delivery, recipient-bound monotonic status, bounded failed-send retries and UNKNOWN handling |
| Rate limits | IP limits plus durable per-account action budgets; two application instances and changing IP still allow only 60 shared payment actions/minute |
| Audit | Append-only audit/consent triggers, protected invoice history and checked runtime grants; no prompts, notes or secret values in operation evidence |
| Configuration | Demo/OTP/MFA deployment guards, exact HTTPS origins, explicit trusted proxy CIDRs, client release guards; no automatic production migrations |
| Privacy | Separate marketing/service/AI/WhatsApp consent, owner exports, immediate access termination with retained-record review |

## Findings and disposition

| Severity | Finding | Disposition |
| --- | --- | --- |
| HIGH | Missing production SMS delivery | **BLOCKED**. Existing identity remains development-only/disabled; select and integrate provider before deployment can support public sign-in. |
| HIGH | Live checkout/recurring billing not connected to provider adapter | **BLOCKED**. Adapter and signed inbox are implemented and tested locally, but captured-event reconciliation, customer checkout and all domain fulfillment need provider acceptance. Do not describe this as keys-only activation. |
| HIGH | No independent deployed security assessment | **BLOCKED**. Validate actual TLS/ingress/proxy headers, runtime database credentials, DNS, monitoring and penetration-test scope in staging. |
| HIGH | Android signing/store release not validated | **BLOCKED**. Final isolated ARM64 release compilation passed after resource cleanup; private signing, owned store identity and physical-device acceptance remain unavailable. |
| HIGH | Legal/retention/medical governance not approved | **BLOCKED**. No compliance, certification, medical verification or automatic complete erasure is claimed. |
| HIGH | Real media/video and shipping integrations remain unavailable | **BLOCKED**. Existing controlled states must remain visible until approved adapters and operational workflows exist. |
| MEDIUM | Audit intent/result is not a single transaction with every legacy mutation | Intent is durable before admin access; result is recorded on response. A crash can leave ATTEMPTED without a terminal record. Investigate unmatched request IDs; use the same audit transaction when extending legacy money-moving actions. |
| MEDIUM | External configuration-change audit integration remains incomplete | Successful ADMIN_LOGIN is recorded in the session transaction; administrative access/step-up and mutations are audited. Secret-store/deployment configuration changes still require platform audit ingestion and operational review. |
| MEDIUM | Single runtime database role can access several domains | Application ownership checks are tested. Separate runtime and migration identities are prepared and local grants tested. Further role/row separation and actual deployed permissions need operator review. |
| MEDIUM | No automatic retained-record erasure workflow | Access deletion is explicit, immediate and honest. Privacy queue is review-only; retention decisions, case completion and identity anonymization need approved policy. |
| MEDIUM | Runtime metrics and some IP quotas are per process | Persistent account limits protect key authenticated mutations. External metrics aggregation, distributed edge limits and alert routing require deployment configuration. |
| MEDIUM | Archived sold programs become unavailable to customers | History is retained. Business must approve withdrawal/refund policy; archiving must not be used to silently remove a customer's purchased education. |
| MEDIUM | No load/PITR/off-site recovery acceptance | Local restore passed; do not infer a production recovery objective from it. Plan capacity, encrypted retention, recovery tests and alert ownership. |
| MEDIUM | Static web CSP needs final provider acceptance | Default serving is restrictive. Final video hosts/consultation frames need reviewed specific allowlists and browser validation, not wildcard expansion. |
| LOW | PostgreSQL driver reports a future pg@9 concurrency deprecation | Current locked dependency tests pass. Investigate Prisma/driver behavior before that major upgrade. |
| LOW | Flutter release warns about optional Cupertino icon font | No source use of CupertinoIcons was found; builds pass. Check device rendering as part of store QA. |
| LOW | Flutter dependencies have newer available versions | `dart pub outdated --no-dev-dependencies` reports newer secure-storage/video-player versions and transitive updates. Locks are preserved; freshness is not a security advisory scan. Review native compatibility and advisory coverage before upgrading or launching. |

No unresolved **observed exploit** was found in the tested local paths. This does
not remove the launch blockers or establish safety in untested deployments.

## Resolved during Phase 7

- Admin worklist contrast and unbalanced desktop grid; scoped browser recheck passed.
- Notification pagination overflow at 320px; responsive wrapping and regression test passed.
- Android debug manifest conflict after explicit release cleartext prohibition; debug-only replacement added.
- Shared action budget originally too small for legitimate multi-step checkout; set to 60, then tested the 61st denial across instances/IPs.
- Test-only provider fixtures affected current revenue totals; kept historical synthetic fixtures outside the report window, preserving all original assertions.
- MFA test used wall-clock current code instead of the consumed counter; fixed the test to exercise actual replay across a clock boundary.
- Optional marketing revocation previously cancelled service deliveries; channels are now kept separate.
- Unknown/accepted WhatsApp deliveries are excluded from blind retries.

## Tooling incident

During local admin QA, a status probe exposed a synthetic, single-use development
OTP in tool output and a screenshot. The challenge was consumed, screenshot
replaced, and helpers/browser state cleared. No production secret or session
token was exposed. Future probes must not capture OTP-screen notices. This is
recorded as a tooling issue, not omitted from the audit.

## Sources for implemented provider contracts

TOTP follows [RFC 6238](https://www.rfc-editor.org/info/rfc6238/).
Payment verification uses the [Razorpay checkout contract](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/?preferred-country=IN)
and [webhook raw-body guidance](https://razorpay.com/docs/webhooks/faqs/).
The outbound/status adapter follows Meta's [WhatsApp Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).
These references establish wire contracts, not provider approval or legal compliance.
