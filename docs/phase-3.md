# Phase 3 — Doctor Consultation & Doctor Network

Pocket Doctor retains all four services. Phase 3 implements the consultation
reservation, payment, scheduling and record workflows. It does **not** supply a
live clinical connection: no video/audio/chat provider or production payment
adapter is configured. The UI says this before reservation and on appointments.
Local demonstration accounts are never represented as real verified doctors.

## Run locally

Use the existing Node 24, PostgreSQL and Flutter setup in the root README.
Copy the root `.env.example` into `services/api/.env`, set a local `DATABASE_URL`
and a randomly generated `SESSION_SECRET`, then explicitly opt in:

```dotenv
APP_ENV=development
OTP_MODE=development
PAYMENT_MODE=development
DEMO_PROGRAMS=true
DEMO_CONSULTATIONS=true
CORS_ORIGINS=http://127.0.0.1:8080,http://127.0.0.1:5173
CANCELLATION_WINDOW_MINUTES=120
BOOKING_HOLD_MINUTES=10
```

```sh
cd services/api
npm ci
npm run build
npm run db:deploy
npm run programs:seed
npm run consultations:seed
npm run dev
```

The consultation seed reuses the demo professional associated with the programs.
It links a synthetic doctor account, `+919999900303`, to that profile. Request its
random development OTP through the existing auth API; there is no fixed code. The
seed refuses to replace a real doctor or another account assignment. Existing
availability/profile preferences are preserved on repeat runs.

For the user app:

```sh
cd apps/mobile
flutter pub get
flutter run -d chrome --web-port=8080 --dart-define=API_BASE_URL=http://127.0.0.1:3000/api/v1 --dart-define=SHOW_DEVELOPMENT_OTP=true
```

Android emulator uses `http://10.0.2.2:3000/api/v1`. Demo servers bind to loopback;
physical-device networking needs a separately secured development arrangement.
The separate Doctor Portal web app has since been removed; backend doctor and
consultation APIs remain available.

## Doctor identity and verification

The existing `Doctor` now optionally references one existing `User`. `UserRole`
remains authoritative: doctor APIs require `DOCTOR` plus the linked, verified
doctor record. A patient role does not grant doctor access; `ADMIN` is not an
implicit bypass for private notes. A person can have both USER and DOCTOR roles.

Verification states are PENDING_VERIFICATION, VERIFIED, SUSPENDED and INACTIVE.
Only VERIFIED, accepting profiles appear in discovery/slots. Real professional
credentials must be reviewed by an authorized operator before a controlled
database operation records status, verifiedAt, qualification and registration
evidence. No public API or doctor form grants verification, edits fees or changes
registration identifiers. Those fields are excluded from writable DTOs.

The migration preserves previously verified real program professionals. Program
publishing now also respects suspension/inactive verification status. Demo data
requires explicit local opt-in, is hidden by default, and is rejected in staging
or production. A DEMO profile never displays a real verified badge or fabricated
qualification, experience, registration number or portrait.

## Data and scheduling

The new tables are `DoctorAvailability`, `DoctorAvailabilityException`,
`Consultation`, `ConsultationNote` and `ConsultationReminder`. There is one
appointment system, one user system and one payment ledger. The existing
`EnrollmentPayment` table keeps its historical name for compatibility; it now
has an optional consultation target and optional program target. A SQL CHECK
requires exactly one target. Program APIs retain their original contracts.

Availability uses ISO weekdays (1 Monday through 7 Sunday), local start/end
minutes and a named timezone, default Asia/Kolkata. Separate disjoint windows
represent breaks; exception dates block the entire doctor's local day. Doctors
can edit duration (10–120 minutes), buffer (0–60), windows and accepting status.
Changes affect future slot generation, not an existing appointment's snapshot.

The server generates slots for one requested local date within the next 30 days.
It enumerates UTC instants through the doctor's timezone, rejecting invalid
clock-transition intervals rather than guessing offsets. DST repeated local
times have distinct UTC identifiers. A 15-minute lead time applies. The API
returns UTC timestamps; Flutter displays the device's local time and zone label.
The date picker explicitly selects a calendar day in the doctor's timezone. The
portal displays the doctor's configured timezone. Appointment timestamps use
PostgreSQL timestamptz; fee, currency, timezone, duration and buffer are snapshots.

## Booking integrity and lifecycle

Booking, payment, rescheduling and availability writes lock the Doctor row in a
transaction. Expired pending holds are released before attempting a new claim.
PostgreSQL additionally enforces a GiST exclusion constraint over doctor UUID and
the `[start, end + buffer)` range for pending, confirmed and in-progress bookings.
This protects overlapping start times as well as exact duplicates. It requires
the standard `btree_gist` extension; migrations must run with permission to create
it. See [PostgreSQL range constraints](https://www.postgresql.org/docs/16/rangetypes.html#RANGETYPES-CONSTRAINT).

```text
Paid reservation → PENDING_PAYMENT → verified receipt → CONFIRMED
Free reservation → CONFIRMED
PENDING_PAYMENT → EXPIRED or CANCELLED
CONFIRMED → CANCELLED, IN_PROGRESS or NO_SHOW
IN_PROGRESS → COMPLETED
```

UPCOMING is a view grouping; it is not a second authoritative status. Pending
payment holds expire after BOOKING_HOLD_MINUTES. A failed payment stays failed;
a new attempt is allowed while the hold is valid. Closing the simulator dialog
does not charge or confirm anything. The hold can be cancelled or expires.

Only the assigned doctor can perform lifecycle actions. Until a real connection
adapter exists, start/complete/no-show actions are available solely for explicitly
marked demo records. Start is permitted from ten minutes before start until end;
no-show only after end. No patient API accepts status or a client payment-success flag.
Completed records are history, not a medical outcome claim.

## Payments and provider boundaries

Consultations reuse `DevelopmentPaymentProvider` and `receiptMatches` from the
program module. The backend creates persisted orders from the appointment's fee
and currency. The simulator is allowed only for opted-in local demo doctors and
is forbidden in deployed environments. Real paid booking fails closed without
an implemented provider. No real funds move, card information is collected or
refund claimed by the simulator.

Settlement locks the same doctor resource, checks appointment/user ownership,
expiry and verification, then compares a server-side provider receipt against
the stored order. A verified receipt and appointment confirmation commit together.
Already settled callbacks return the existing result; duplicate calls cannot
create a second appointment or re-confirm a cancelled one.

`verifyRazorpayWebhook` validates HMAC over raw bytes using timing-safe comparison.
It is an adapter building block, **not an enabled webhook endpoint**. A production
adapter must create a provider order, verify checkout/webhook signatures, fetch
captured status, match order/amount/currency, deduplicate provider events and use
the same transactional settlement invariant. A signature or client callback alone
never grants access. `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and
`RAZORPAY_WEBHOOK_SECRET` are placeholders, not feature-enable switches.

`ConsultationSessionProvider` defines short-lived, participant-scoped session
access. Its current implementation always fails closed. A future provider must
check identity, assigned doctor/patient, confirmed payment, status and join window
before issuing access. Never put permanent public meeting URLs, provider secrets
or unrestricted room identifiers in discovery or appointment DTOs.

## Cancellation, rescheduling and reminders

Confirmed reservations can change before CANCELLATION_WINDOW_MINUTES. Pending
holds can cancel before expiry. Cancellation releases the slot and cancels
reminder outbox rows. Verified payments become REVIEW_REQUIRED for refund review;
this is not a refund. Actual provider refunds and reconciliation remain disabled.

Rescheduling is implemented atomically for the same doctor and duration. It first
validates the new generated slot and policy, then updates the original appointment
and reminders in one transaction. On conflict the original time and payment stay
intact. Changes do not extend an unpaid hold. Fee and currency stay as booked.

Reminder rows hold 24-hour, one-hour and start-time events when those times remain
in the future. This is a durable outbox foundation; no push or background delivery
worker is enabled. Expiry is enforced on reads and transaction claims; a future
worker may proactively release old holds without changing these checks.

## Records, privacy and access

Private doctor notes and patient-visible summaries are distinct fields in the
note table. The assigned verified doctor alone can write notes during or after
a visit. Patients receive only their own completed visit summary and follow-up
fields, never `privateNote`. Follow-up is doctor-entered, with an optional local
date and note. No diagnosis, prescription or AI-generated clinical content exists.

Patient list/detail APIs filter by the authenticated User ID. Doctor lists filter
by the assigned Doctor ID. Neither accepts an alternate patient ID from the client.
Writable doctor operations recheck verification after acquiring the row lock.
The API selects patient name only for the doctor's agenda, not phone or health
interests. Response cache-control remains no-store. Existing logging records
route patterns and status only, never payloads, tokens, notes or identities.
Analytics use aggregate event-name counters, no search text or record details.

Native Flutter tokens retain secure storage; browser tokens stay in memory. Both
interfaces clear local session/private state on logout or unauthorized response.
The portal ignores stale responses after a session change. No external tracking,
real patient seed data or credentials are added. Formal consent, retention,
clinical auditing, deployment hardening and compliance review remain required
before any production health-data use; no compliance certification is claimed.

## API contract

All paths below are relative to `/api/v1`; responses use `{data: ...}` and errors
use the existing safe error envelope. IDs and strict bodies are validated with Zod.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/doctors` | q, specialty, featured and page filters; 20 results/page |
| GET | `/specialties` | Actual bookable profile specialties |
| GET | `/doctors/:id` | Safe public professional DTO |
| GET | `/doctors/:id/slots?date=YYYY-MM-DD` | Server-generated available UTC slots |
| POST | `/consultations/book` | doctorId, date, startsAt; server price/status |
| GET | `/me/consultations` | Own upcoming/history, newest 100 |
| GET | `/me/consultations/:id` | Own appointment and appropriate shared summary |
| POST | `/consultations/:id/payment` | Persist or reuse pending order |
| POST | `/consultation-payments/:id/development-settle` | Demo outcome capture/fail |
| POST | `/consultations/:id/cancel` | Policy-checked cancellation |
| POST | `/consultations/:id/reschedule` | date, startsAt; atomic replacement |
| GET | `/doctor/appointments` | Assigned agenda and notes, newest 100 |
| GET / POST | `/doctor/availability` | Own windows, exceptions and settings |
| GET / PATCH | `/doctor/profile` | Own profile; writes bio/languages only |
| POST | `/doctor/consultations/:id/notes` | Private note, summary and follow-up |
| POST | `/doctor/consultations/:id/action` | Controlled demo start/complete/no-show |

## Flutter and doctor portal

The feature extends `features/consultation/{domain,data,application,presentation}`.
Typed models cover doctors, pages, slots, appointments, summaries and payments.
`ConsultationRepository` is the only feature network boundary; widgets do not make
raw requests. Riverpod providers cover repository, filters, discovery, specialties,
doctor detail, slots, selected doctor/date slot, own appointments, appointment
detail and mutation/loading/error state. The backend remains the persistent source
of truth. No alternate Flutter HTTP client or state framework was introduced.

Routes: `/consult` (Find a Doctor / Upcoming / History), `/doctors/:id`,
`/doctors/:id/book`, `/consultation/:id`, `/consultation/:id/confirmation`.
Rescheduling uses the booking screen with an appointment reference. Existing
GoRouter auth guards protect all new routes. Bottom navigation stays unchanged.
Home links to discovery and shows at most one upcoming reservation.

Historical Phase 3 implementation: the subsequently removed doctor portal used a small Vite/TypeScript DOM
application, with no extra state-management framework. The reserved Phase 0 portal
had no executable framework to preserve; this avoids a second server when the
existing versioned backend owns all business operations. It includes an agenda,
appointment notes/follow-up, profile and availability editor. No program publishing,
payout, administration or prescription UI is implemented.

## Validation commands

```sh
cd services/api
npm run typecheck
npm run db:validate
# Point only to an isolated test database before AUTH_INTEGRATION=true npm test.
npm test
cd ../../apps/mobile
flutter analyze
flutter test --concurrency=1 --dart-define=RUN_API_SMOKE=true --dart-define=RUN_AUTH_SMOKE=true --dart-define=RUN_PROGRAM_SMOKE=true --dart-define=RUN_CONSULTATION_SMOKE=true
flutter build apk --debug
flutter build web --debug
```

See [validation evidence](phase-3-validation.md) for actual results and
[source inventory](phase-3-files.md) for file changes. Phase 4 is not started.

## Remaining production items

Production SMS/OTP; reviewed real doctor network; real Razorpay checkout/webhook
adapter and refunds; secure video/audio provider; background reminders; complete
audit/consent/retention workflows; approved logo asset; deployment; iOS and physical
device validation. Appointment lists currently cap at 100; pagination and provider
reconciliation need completion before broad production use. Certificates, commerce,
AI/WhatsApp, membership and the full admin portal are outside Phase 3.
