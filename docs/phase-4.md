# Phase 4 — Exclusive Wellness Products & Commerce

Pocket Doctor's Wellness experience is a controlled catalogue, not a general
pharmacy. This phase implements the customer commerce journey and the minimum
backend operations needed to manage it. Phase 5, subscriptions, prescription sales
and a full admin dashboard are excluded. No production readiness or regulatory
compliance is claimed.

## Run locally

Use the existing Flutter SDK, Node 24 and PostgreSQL setup. In the API environment,
set `DATABASE_URL`, `APP_ENV=development`, `DEMO_WELLNESS=true` and
`PAYMENT_MODE=development`. OTP additionally needs `OTP_MODE=development` and a
random `SESSION_SECRET` of at least 32 characters. Never commit `.env` or place
provider credentials in Flutter.

From `services/api`:

```sh
npm run build
npm run db:validate
npm run db:deploy
npm run wellness:seed
npm run dev
```

The seed inserts nine conceptual categories and two clearly marked non-ingestible
demo products: a bottle and a journal. Names, materials and manufacturers are
explicit examples, not real endorsements or sale offers. Seed reruns do not reset
stock or orders. `DEMO_WELLNESS` and development payments are rejected in staging,
production and production Node mode. Demo servers bind to loopback.

From `apps/mobile`, use the existing emulator/API setup, or local browser validation:

```sh
flutter run -d chrome --web-port 8080 --dart-define=API_BASE_URL=http://localhost:3000/api/v1 --dart-define=SHOW_DEVELOPMENT_OTP=true
```

Configure the exact matching backend `CORS_ORIGINS`. Android emulator development
uses the existing `10.0.2.2` API configuration. Real device, iOS and deployment checks
are separate production dependencies.

## User journey and navigation

Home → Wellness → product → My Cart → Checkout → address management → reviewed
checkout → pending order → explicit demo payment → server-confirmed order → tracking
and history. Profile links to My Orders. The existing five bottom tabs remain.

Protected routes: `/wellness`, `/products/:id`, `/cart`, `/addresses`, `/checkout`,
`/orders`, `/orders/:id`. `/shop` remains a redirect for earlier links. Address
editing is a form route within the authenticated navigator. AI remains a future
state; no new medical functionality is added.

## Catalogue and inventory model

WellnessCategory is data-driven. WellnessProduct stores name, slug, SKU, descriptions,
images, price/MRP in integer paise, brand/manufacturer, material/ingredient details,
usage, warnings, storage, quantity label, shipping eligibility, return policy,
optional doctor relationship, curated collection and featured status.

Products support DRAFT, ACTIVE, OUT_OF_STOCK, INACTIVE and ARCHIVED. Customer queries
return only ACTIVE, content-approved, unrestricted products, with demo visibility
controlled by environment. ACTIVE with zero available stock remains visible but
cannot be bought. OUT_OF_STOCK status itself is hidden as required. Publishing
requires explicit administrative content approval. `requiresEligibility=true`
blocks ordinary checkout; no prescription or restricted-product eligibility flow
is implemented. Doctor association is displayed neutrally and never as a prescription.

Inventory is colocated on the product: `stockQuantity` means unsold physical stock,
`reservedQuantity` is the held subset, `soldQuantity` records confirmed net sales
after pre-processing cancellations. Available quantity = stock − reserved. Keeping
these counters on one row avoids a redundant one-to-one inventory model. The database
rejects negative counters, reservations greater than stock and invalid prices.

## Cart, address and checkout

CartItem has a unique user/product pair, quantity 1–10 and observed price for change
messaging. Updates set an absolute quantity, making transport retries safe. Carts
hold at most 20 products. Cart prices always come from the current product record;
unpublished products are represented as unavailable without exposing draft content.

Addresses contain only delivery contact/location fields, belong to one user, support
add/edit/delete/default and have a maximum of ten per user. India and a six-digit
PIN are validated; this is format validation, not proof of delivery serviceability.
One partial unique index prevents multiple defaults. Order address snapshots survive
later edits/deletion of an address.

Checkout revalidates active status, unrestricted eligibility, current price, stock,
quantity and shipping eligibility. The server calculates subtotal + delivery − discount.
The response includes an opaque digest of the reviewed items, prices, address and
total. The client submits that digest, address ID and UUID idempotency key; monetary
fields are rejected by strict request validation. Changes require renewed review.
Discount is presently zero; MRP comparison is informational. Coupons, tax engines
and membership pricing are not implemented.

## Transactions, reservations and retries

All commerce mutations use PostgreSQL transaction-scoped advisory lock `740004`.
This deliberately serializes a small curated catalogue and works across API instances.
No process-local lock is trusted. For future volume, replace it with consistently
ordered SKU locks and retain concurrency tests. Production load testing is outstanding.

Order creation reserves stock and writes immutable item/address/price snapshots in
the same transaction. Unique `(userId, idempotencyKey)` and request-hash comparison
prevent duplicate checkout retries. An identical pending checkout also reuses its
order after an app restart with a new key. A changed request using the same key is
rejected. An expired or failed order is retained; a new reviewed checkout uses a new key.

Holds last `ORDER_HOLD_MINUTES` (default ten, range one–thirty). Payment failure,
expiry or unpaid cancellation releases reservations. Reads and mutations lazily
release expired holds. Also run `npm run commerce:cleanup` periodically on the server
to release them without traffic. The command is safe to repeat. No production
scheduler was deployed in this phase.

## Shared payments and idempotency

EnrollmentPayment retains its existing table/name and now has optional `orderId`.
A SQL constraint requires exactly one purchase target. Program and consultation
services retain their target checks. Commerce initiation uses the stored order
total, reuses pending payments and exposes no secret provider references.

The existing PaymentProvider/DevelopmentPaymentProvider and `receiptMatches` are
reused. Settlement matches receipt/order amount/currency and captured status, then
atomically converts reserved units to sold units, records VERIFIED payment and one
CONFIRMED event. Duplicate settlement returns the existing order without another
deduction. Revoked product eligibility is checked before demo settlement. A client
payment-success value is never sufficient for real access or order confirmation.

The only enabled checkout is explicitly local **DEMO**. No Razorpay integration is
enabled merely by filling environment keys. A production adapter must create the
provider order, validate raw webhook signatures using the existing webhook-verification
boundary, fetch captured status, match the stored order/amount/currency and call a
shared atomic settlement path. It must handle late captures after expiry with an
honest refund/reconciliation path. No unauthenticated mock callback is exposed.

## Orders, shipping and refunds

The lifecycle is PENDING_PAYMENT → CONFIRMED → PROCESSING → PACKED → SHIPPED →
OUT_FOR_DELIVERY → DELIVERED. Terminal unpaid alternatives are PAYMENT_FAILED,
EXPIRED and CANCELLED. Only supported transitions are accepted; customers cannot
mark delivery. Every state change creates an OrderEvent used for the visible timeline.
Order numbers use the full unique order UUID with a PD prefix.

ShippingProvider defines quotation. The demo adapter quotes INR 50 and explicitly
states that no goods ship. Address, fee, carrier and tracking number are stored on
Order; a separate empty Shipment abstraction is unnecessary until split shipments
exist. Administrative shipping requires both carrier and tracking number. No fake
delivery date, carrier integration, tracking link or automatic status is generated.

Pending orders can be cancelled. `ORDER_CANCEL_CONFIRMED=true` allows cancellation
only before processing; it restores stock once and records `refundStatus=REQUESTED`.
Refund processing/completed/failed states are reserved for provider reconciliation;
the current UI does not claim a refund occurred. Configurable per-product return
policy is snapshotted on each purchased item. Advanced returns, reverse logistics
and automatic financial refunds remain out of scope.

## API

All routes below use `/api/v1`. USER routes require a current session and USER role.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/wellness/products` | Search/category/price/availability/featured/collection; paginated |
| GET | `/wellness/products/:id` | Active unrestricted details |
| GET | `/wellness/categories`, `/wellness/featured` | Data-driven discovery |
| GET | `/me/cart` | Current items, availability and authoritative subtotal |
| POST | `/me/cart/items` | Set product quantity |
| PATCH, DELETE | `/me/cart/items/:id` | Update/remove owned cart row |
| GET, POST | `/me/addresses` | List/add owned addresses |
| PATCH, DELETE | `/me/addresses/:id` | Edit/default/delete own address |
| POST | `/checkout` | Review server-calculated quote for owned address |
| POST | `/orders` | Idempotent order creation and stock reservation |
| POST | `/orders/:id/payment` | Initiate shared payment |
| POST | `/order-payments/:id/development-settle` | Explicit local provider simulation |
| GET | `/me/orders`, `/me/orders/:id` | Own history/detail |
| POST | `/orders/:id/cancel` | Server-policy cancellation |

Minimum ADMIN-only mechanisms (no dashboard): GET/POST `/admin/wellness/products`,
PATCH `/admin/wellness/products/:id`, POST `/admin/wellness/products/:id/inventory`
with a signed stock adjustment, POST `/admin/wellness/categories`, GET
`/admin/wellness/orders`, GET `/admin/wellness/orders/:id`, and POST
`/admin/wellness/orders/:id/status`. Fulfilment staff receive only the order detail
needed for fulfilment; customer/doctor roles cannot use these routes. Do not expose
ADMIN session provisioning through customer authentication.

## Flutter state and UX

`features/wellness/domain` owns typed DTOs; `data/commerce_repository.dart` is the
only network boundary, using the existing ApiClient/package:http. Riverpod owns
filters, catalogue/categories/detail, cart, addresses, checkout quote, order lists,
order detail and mutation states. Repository providers depend on active identity;
old user data is discarded when identity changes. Sensitive data is not added to
unsecured local storage. Existing secure session behavior is preserved.

Screens use reusable commerce page, image fallback, product card, asynchronous state,
action/error, empty-state and total components with the locked navy/green design.
Search retains its input after network errors. API errors expose friendly messages;
reads support retry and actions can be retried without accepting client totals.
Order detail polls every thirty seconds. Action state remains observed during
loading so payment dialogs survive asynchronous refresh. No extra state framework,
HTTP client or commerce dependency was introduced.

Collections and featured selections are business-curated. They do not imply a
medical recommendation. Advanced personalized recommendations and favorites are
deferred; no health-based product recommendation engine is present.

## Privacy, analytics and production boundaries

Routes use authenticated user IDs, never client-supplied ownership. Orders and
addresses are private; customer DTOs omit provider references, payment rows and
checkout request hashes. Existing logging records route templates/status only,
not request bodies, search terms, addresses, phones or tokens. No card data is stored.
Aggregate in-process analytics count named commerce events only, without identity,
search text, product-health associations or delivery details. A persistent analytics
sink and dashboard are not included.

Before real commerce, the business must approve the actual catalogue, claims,
manufacturer/product information, eligibility boundaries, return policies, shipping
coverage and tax handling. Production payment, webhook/refund reconciliation,
logistics, secure media/CDN operations, consent/retention/access auditing, support,
licensing and applicable legal/regulatory requirements require separate validation.
Software controls are not a claim of compliance. Approved logo, deployment, real
devices and iOS validation remain outstanding from earlier phases.

## Validation commands

```sh
# services/api, using an isolated PostgreSQL database
npm run typecheck
npm run build
npm run db:validate
npm run db:deploy
# Set AUTH_INTEGRATION=true before running all database tests
npm test

# apps/mobile; start the local API and seed all four demo domains first
flutter analyze
flutter test --concurrency=1 --dart-define=RUN_API_SMOKE=true --dart-define=RUN_AUTH_SMOKE=true --dart-define=RUN_PROGRAM_SMOKE=true --dart-define=RUN_CONSULTATION_SMOKE=true --dart-define=RUN_COMMERCE_SMOKE=true
flutter build apk --debug
flutter build web --debug

# apps/doctor-portal
npm test
npm run build
```

See [recorded validation results](phase-4-validation.md). Phase 5 has not started.
