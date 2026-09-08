# Phase 4 local validation — 7 September 2026

Environment: Windows, Flutter 3.44 / Dart 3.12, Node 24, JDK 17, Android SDK 36 and
an isolated loopback PostgreSQL database. Only clearly labelled synthetic users,
products, addresses and orders were used. No real payment or delivery occurred.

| Check | Result |
| --- | --- |
| Backend full suite, real PostgreSQL | 51 passed, zero skipped |
| Backend strict TypeScript and build | Passed |
| Prisma validation | Passed |
| All five migrations on isolated database | Passed |
| Database/schema drift | No difference |
| Health and database readiness | HTTP 200, phase 4 / ready |
| Doctor portal regression tests | 8 passed |
| Doctor portal TypeScript and production build | Passed |
| Commerce + navigation responsive tests after layout fixes | 20 passed |
| Final Flutter analysis and full live suite | No analyzer issues; 56 passed, zero skipped |
| Final Android debug artifact after layout fixes | Passed; 230,257,544-byte APK |
| Final web debug artifact after layout fixes | Passed; 12,968,862-byte main.dart.js; Wasm dry run passed |
| Customer browser checkout and confirmation | Passed on final web build |
| Dart repository format check | 73 files; zero changes required |
| Targeted source credential scan | No private-key blocks or live provider credentials found |

The commerce PostgreSQL suite covers listing/detail/categories/search/price filters,
unrestricted publication, cart writes/removal/current-price recalculation, addresses,
ownership, checkout-price changes, simultaneous final-unit buyers, checkout retry,
payment replay, stock reservations/failure/expiry/cancellation, revoked eligibility,
admin catalogue/inventory authorization, immutable snapshots and sequential fulfilment.
Existing authentication, program access/progress and consultation tests remain intact.

Flutter tests cover discovery/search/category/price filters, product details, cart
quantity/unavailability, addresses, checkout, payment loading/failure/confirmation,
tracking/refunds, history, routing and error retry. Live smoke tests communicate
through the real Flutter repositories to the API and PostgreSQL. Responsive navigation
checks include commerce routes at 320×568, 390×844, 844×390 and 1024×768 with normal
and doubled text size.

The final browser journey verified onboarding/login/profile, Home → Wellness,
product → cart, address creation, and restoration of the saved cart/address after
closing and reopening a fresh browser session. Checkout showed INR 250 in products
plus INR 50 demo delivery, totalling INR 300. The explicit demo payment dialog survived the
polling interval; server settlement returned CONFIRMED, and My Orders retained the
order with its original item, amount and address. Final mobile catalogue, checkout,
confirmation and history screenshots were inspected and saved under ignored
`artifacts/phase4-*.png`. All data is synthetic. No OTP/token screenshot or browser
session state file was saved.

Browser review prompted compact category/filter controls so products appear sooner.
Expanded responsive tests found a 16-pixel product-placeholder overflow at doubled
text size on the smallest viewport; natural-height rendering corrected it. The older
Phase 1 navigation assertion was updated from the retired shop-preview heading to
the implemented store, without removing its auth/navigation coverage.

The first doctor-portal regression attempt hit sandbox child-process `EPERM` errors;
rerunning with required execution permission passed. No code workaround was needed.
Automatic approval initially rejected the browser Place order action because it
misidentified the task as Phase 2. Read-only verification of the latest user attachment
(Phase 4, explicit demo checkout testing) and the isolated development configuration
resolved the mismatch; the same action was approved on retry, without a workaround.
The existing pg 8 concurrent-query deprecation warning remains non-failing; review
the Prisma adapter before a pg 9 upgrade.

Source/security review is recorded in [phase-4-review.md](phase-4-review.md). A targeted
credential scan covers the 24 new and 18 modified files in
[phase-4-files.md](phase-4-files.md); one superseded placeholder was removed.
This is not a formal security audit. No Git repository exists,
none was initialized and no commit was possible.

Cleanup completed: the dedicated browser and temporary web/API servers were closed,
the isolated PostgreSQL instance was stopped, and random runtime credential/PID
files were removed. Ignored synthetic database, build and screenshot artifacts remain
local and are excluded from the source inventory.

Production OTP, real Razorpay checkout/webhooks/refunds, shipping/tax integrations,
approved catalogue/claims/policies/logo, operational audits, deployment, physical
devices and iOS remain outside local validation. No compliance or public-launch
readiness is claimed. Phase 5 has not started.
