# Pocket Doctor mobile

Phase 4 authenticated Flutter app for Android and iOS. Browser builds are a validation
convenience, not a separate production user web application.

See the [repository README](../../README.md) for setup, environment values and
test/build commands, and [architecture](../../docs/architecture.md) for the
Riverpod, navigation and feature-folder conventions.

Sign-in uses explicitly configured development OTP until a production provider is
implemented. Profiles, program enrollment and learning progress connect to PostgreSQL.
Recorded lessons use the official Flutter video player; paid demo programs use an
explicit local simulator. Consultations now support discovery, reservations, payment
state, rescheduling, cancellation and records. Live connections remain provider-ready
and unavailable. Wellness now includes catalogue, cart, addresses, checkout and
orders with explicit demo payment/shipping. The assistant remains a preview. See
[Phase 4 setup and boundaries](../../docs/phase-4.md) and
[Phase 3 setup and boundaries](../../docs/phase-3.md). Place the
approved logo as documented in [assets/brand](assets/brand/README.md).
