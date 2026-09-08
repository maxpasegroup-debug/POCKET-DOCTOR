# Phase 6 — Membership + Revenue Engine

**Status: COMPLETE for the locally validated development/provider-ready scope. Production recurring payments remain unconfigured.**

Pocket Doctor keeps its free account experience. Membership is optional and connects selected learning, consultation, wellness and assistant benefits. No health outcome is promised. Phase 7 has not been started.

## Scope and configuration

The database owns plans, prices, billing intervals, trial/grace durations, benefit labels and resource allowlists. The controlled seed creates **Pocket Doctor Plus · DEMO** with monthly and annual billing options. Its ₹199/month and ₹1,990/year are test data, not approved commercial pricing. Flutter does not define these prices.

Use the existing environment settings. `PAYMENT_MODE=development` permits local simulation only in development/test; production and staging reject that mode. Production recurring payments remain unconfigured. Real plans may be displayed, but their purchase is disabled until an approved provider implementation is connected. No card details, mandates or payment credentials are stored in the app.

From `services/api`:

```sh
npm run generate
npm run db:deploy
npm run programs:seed
npm run consultations:seed
npm run wellness:seed
npm run membership:seed
npm run membership:cleanup
```

Seeds require an explicitly configured isolated development database. Membership seeding uses existing demo resources and preserves existing plan records. Restarting/reseeding does not reset subscriptions or stock. `membership:cleanup` updates expired holds/terms and creates due lifecycle events; it does not delete financial history. A production scheduler is not installed.

## Data model

`MembershipPlan → MembershipBenefit` defines a billing option and its benefits. `Subscription` belongs to one existing User and one plan. A subscription snapshots agreed regular price, interval, grace policy and benefits so later plan edits cannot change an already paid term.

`Coupon → CouponPlan` scopes an offer to plans. `CouponRedemption` reserves usage for a persisted payment, then records successful use. An introductory coupon is also the small promotional campaign structure: it has a code, time window, eligible plans, discount, limits and active status. The system applies at most one offer and never stacks promotions.

`SubscriptionEvent` records lifecycle history and pending notification events. `Invoice` is a receipt tied to the **existing EnrollmentPayment** ledger. Membership adds a fourth payment target; the SQL constraint still requires exactly one of program, consultation, wellness order or subscription.

Constraints include unique plan slug, coupon code, invoice number, invoice payment, user/request key and one open membership per user. Coupon bounds and subscription dates are checked in SQL as well as input validation. The three additive Phase 6 migrations preserve earlier models and data.

## Entitlement policy

`membership/entitlements.ts` is the common server boundary. Access requires an eligible provider, valid subscription state and current end/grace date. Flutter renders the server's decision; it never grants benefits.

| Key | Current behavior |
| --- | --- |
| PROGRAM_ACCESS | Enroll in explicitly listed programs without an individual payment; lessons recheck membership on every access |
| MEMBER_PROGRAMS | Required for listed programs marked `membershipOnly` |
| CONSULTATION_DISCOUNT | Percentage saving for explicitly listed doctors, calculated when booking is persisted |
| WELLNESS_MEMBER_PRICING | Percentage saving for explicitly listed products, calculated in product detail, cart and checkout |
| MEMBER_PRODUCTS | Required for listed products marked `membershipOnly`; checkout/settlement recheck access |
| AI_WELLNESS_FEATURES | Adds the configured number of daily assistant requests to the existing free allowance; safety limits still apply |
| PERSONAL_TRACKING, MEMBER_OFFERS | Reserved configuration keys; no additional paid feature is advertised or gated by the seed |

Empty resource lists never mean unrestricted access to all paid programs or products. Existing individually purchased program access remains valid independently of membership unless the program itself is explicitly member-only. Existing tracking and free assistant features stay available. The assistant reads current membership name and benefit labels from authorized backend facts; no model-generated benefit is trusted.

## Lifecycle, checkout and payments

Select plan → server review → optional coupon → persist pending subscription/payment → explicitly labeled demo provider → verify stored order/amount/currency → activate → display confirmation/receipt.

The existing `PaymentProvider`, `DevelopmentPaymentProvider` and receipt matching are reused. No client price, currency, receipt, entitlement or subscription status is accepted. The development-settle endpoint is unavailable outside local development/test. A client outcome is only an instruction to this local simulator, never evidence of a production payment.

Subscription states are PENDING, ACTIVE, PAST_DUE, PAUSED, CANCELLED, EXPIRED and PAYMENT_FAILED. PAUSED is reserved for a provider-supported future operation; no client can set it. PostgreSQL transaction locks and a partial unique index prevent duplicate open memberships. Checkout request keys and unique receipts make retries and repeated callbacks idempotent. Pending checkouts expire after fifteen minutes.

Membership periods use calendar months/years in UTC, clamped to the final day of the month. Manual renewal opens seven days before the paid period ends. A verified early renewal extends from the existing end date. A failed renewal preserves the paid term and only grants a configured grace period. Access checks enforce expiry independently of Flutter and scheduled cleanup.

Cancellation preserves paid access until the period end. Reactivation is implemented for the demo lifecycle only; it does not claim to restore a provider mandate. After expiry, users may rejoin another plan or billing interval. No mid-period proration or automatic debit is implemented.

Trials are opt-in, plan-configured and limited to one trial per existing account by the server. They create no fake payment or receipt and do not automatically charge at expiry. Conversion requires a verified payment. Initial offers retain base and discounted amounts in the redemption record; renewal uses the agreed regular price.

## Coupons and concurrency

Percentage and fixed offers are calculated in integer paise. Validation checks active dates, plan eligibility, global usage, per-user usage and introductory eligibility. Membership transactions serialize coupon reservations across users and API instances. Pending reservations count against limits; failed/expired payments release that usage. Coupon calculation in the Flutter UI is display-only and always comes from the backend.

## Revenue, receipts and refunds

The existing payment ledger is the source of truth across PROGRAM, CONSULTATION, WELLNESS and MEMBERSHIP. The Invoice source is a Prisma/PostgreSQL enum. A database trigger creates one receipt atomically when a payment becomes VERIFIED, including payments from existing phases. Existing verified payments are backfilled once by migration. Receipt number and payment ID are unique.

Receipts show transaction, amount, currency, issued date and demo status. Nullable tax fields are deliberately unconfigured. A receipt is **not a tax invoice** or a claim of accounting compliance. There is no customer API to delete payments. A receipt follows its owning payment if a privileged database maintenance operation deletes that payment.

ADMIN-only aggregation provides bounded daily/monthly amounts and counts by source, currency and payment status; membership states; activation, cancellation, renewal, trial and checkout events; coupon redemptions; and refund states. Demo revenue is excluded by default and explicitly selected with `demo=true`. Pending and failed amounts are not described as successful revenue. Refund requests on membership payments record intent only. Existing consultation/order refund states remain in their original domains. REFUND_PROCESSING, REFUNDED and REFUND_FAILED are reserved for trusted provider processing; no current endpoint marks money returned.

The report also includes explicit totals by currency/status. Only the VERIFIED group represents successful payments. Lifecycle and coupon-applied events persist in PostgreSQL; a non-sensitive `membership_viewed` counter follows the existing process-local analytics convention and resets when the API restarts. It is not a durable cross-instance conversion metric.

## API boundaries

All paths below use `/api/v1` and existing session/role guards.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | /membership/plans | Active plan configuration |
| GET | /membership/current | Own current status and effective benefits |
| GET | /membership/benefits | Own effective entitlements |
| POST | /membership/coupon/validate | Server checkout quote and offer validation |
| POST | /membership/subscribe | Create or retry initial checkout, trial or manual renewal |
| POST | /membership/payments/:id/development-settle | Local provider simulation and server verification |
| POST | /membership/payments/:id/refund-request | Record an owned verified payment's refund request |
| POST | /membership/:id/cancel | Cancel an owned subscription |
| POST | /membership/:id/reactivate | Reactivate an eligible local demo subscription |
| GET | /membership/history | Own paginated subscription history |
| GET | /membership/events | Own lifecycle notification history |
| GET | /me/revenue/transactions | Own paginated transaction history across services |
| GET | /me/invoices, /me/invoices/:id | Own receipts only |
| POST/PATCH | /admin/membership/plans[/:id] | ADMIN plan and benefit configuration |
| POST/PATCH | /admin/membership/coupons[/:id] | ADMIN offer creation and activation control |
| GET | /admin/revenue?days=30&demo=false | ADMIN-only aggregate reporting |

## Flutter and notifications

`features/membership` contains domain models, repository, Riverpod providers/controllers and separate landing, detail, checkout/payment, confirmation/manage and transaction/receipt views. Existing ApiClient and GoRouter are retained. Routes are `/membership`, `/membership/plans/:id`, `/membership/checkout/:id`, `/membership/manage`, `/membership/confirmation`, `/membership/transactions` and `/membership/invoices/:id`. All use the existing authentication redirect.

The Home/Profile membership card is small and optional. Checkout displays regular price, offer price, billing interval, renewal price, manual renewal behavior and cancellation policy. Loading, error, retry and empty states are shared components. Cancellation requires a concrete confirmation dialog. Server-rejected network actions never create a local membership flag.

Riverpod manages plans, current membership, quotes/coupons, action state, invoices, paginated transactions and lifecycle updates. Providers depend on the current identity and invalidate current state after mutations. The existing Notifications screen displays membership updates. Subscription events prepare activation, payment failure, renewal, cancellation and expiry notifications; renewal approaching is created once per term during lifecycle maintenance. No email, WhatsApp, background push or promotional delivery is claimed or sent.

## Boundaries and production dependencies

- Production Razorpay subscription creation, signed webhooks, captured-payment fetching, recurring mandates, provider cancellation/reactivation and provider-confirmed refunds remain unconfigured. Add these behind the existing shared provider boundary before charging real users.
- Commercial prices, benefit resource lists, accounting/tax configuration, cancellation/refund terms, consent and legal review require business approval before launch. No tax, payment, healthcare or consumer-law compliance is claimed.
- No full admin UI, referral rewards, membership certificates or advanced BI. Referral attribution is deliberately deferred under the optional scope; existing User remains the future identity anchor.
- Global membership locking and bounded cleanup batches are appropriate for the current small catalogue. A deployment needs scheduled maintenance, provider reconciliation, monitoring, accounting exports and load testing. Runtime access checks already enforce time cutoffs.
- No new SMS, approved logo, secure video, live consultation, shipping, external AI or WhatsApp delivery integration is introduced by this phase. Earlier documented provider/device/iOS/deployment limitations remain.

## Validation

See [phase-6-validation.md](phase-6-validation.md) for actual commands/results and [phase-6-review.md](phase-6-review.md) for the scoped security review. Phase 7 must not begin automatically.
