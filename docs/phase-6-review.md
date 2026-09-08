# Phase 6 scoped security review

Scope: the new membership implementation and its existing program, consultation, wellness, assistant, payment and routing integration points. This was a local self-review using the code-review skill and adversarial database/API tests, not an independent security audit or a regulatory assessment.

## Findings addressed

- Retained the shared payment ledger and verified-receipt boundary. Client-supplied price, status, currency, user identity and benefits are rejected by strict request contracts. Development settlement is environment restricted; live settlement is unavailable.
- Serialized subscription and coupon mutations in PostgreSQL and added a partial unique index for one open membership per user. Repeated payment callbacks produce one successful payment, activation event and receipt. Renewal requests have persisted retry keys.
- Coupon validation includes pending reservations in global/per-user limits. Expired and failed checkouts cannot later activate a subscription. Calendar term calculation handles short months and leap years.
- Preserved agreed price and benefit snapshots. Active/cancelled terms and configured failed-renewal grace use server dates. Demo subscription entitlements are rejected when development payment mode is disabled.
- Rechecked program and wellness member-only access server-side, including protected lesson information and wellness settlement. Empty resource lists never unlock all paid content. Consultation and wellness prices are calculated by their existing backend purchase flows.
- Fixed an expired-member program edge case: a saved enrollment no longer blocks a later independent purchase. Lesson progress remains intact; an expired subscription alone grants no access.
- All customer subscription, receipt and transaction operations are bound to the authenticated user. ADMIN aggregate/configuration endpoints reject USER roles. No client endpoint can arbitrarily set subscription or refund completion states.
- Reused assistant safety policy. Membership facts come from the account's effective benefit snapshot; the assistant cannot invent benefits or payment success.
- Fixed the Home/Profile membership card's Material-surface assertion. Existing widget fixtures now supply the new membership repository dependency, avoiding unintended real HTTP requests and retry timers in unit tests.
- Browser validation found and fixed a missing Home action after checkout. The final bundle restored the persisted membership after a fresh login and returned to all four core service entry points successfully.

## Residual boundaries

Production subscription webhooks, provider signature/capture checks, mandate cancellation/reactivation, automatic renewal, refunds, tax rules, legal terms and delivery workers remain unconfigured. The implementation exposes a local simulator and fails closed for real payment attempts. A final provider/security/accounting review is required before live billing.

The current small-catalogue implementation uses a global membership transaction lock and bounded maintenance batches. Deployment needs scheduled lifecycle maintenance, reconciliation, monitoring and load testing. Runtime entitlement checks already enforce period/grace cutoffs.

The ledger is authoritative; receipts are not legal tax invoices. No raw OTP, session credential, card data, private clinical data, or provider secret was added to application logs or source. A pattern scan complements this review but is not a comprehensive secret audit. No Git repository is configured, so no commit was created.

See [validation](phase-6-validation.md) for executed tests and build results. Phase 7 is not part of this review.
