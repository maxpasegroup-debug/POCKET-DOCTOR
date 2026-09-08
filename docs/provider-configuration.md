# Provider configuration — P7-A

No provider credentials were supplied for this work. All new adapters default to
disabled. Configuration validation and injected-transport tests are not provider
sandbox or production verification. Never put these values in Flutter/Vite,
screenshots, source control or logs.

| Provider | Variables | Purpose / required when enabled | Status |
| --- | --- | --- | --- |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Matching account keys; independent webhook secret; all required for the relevant adapter/webhook | Local contract tests PASS; sandbox/live BLOCKED |
| SMS option: Twilio | `OTP_MODE=provider`, `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `SMS_OTP_TEMPLATE`, `SESSION_SECRET` | Approved sender/service and template containing exactly one `{code}`; backend-only | Contract/identity tests PASS; real SMS BLOCKED |
| WhatsApp | `WHATSAPP_MODE`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ID` | Exact signed webhook and account boundaries; business ID is optional for historical compatibility but should be supplied in production | Local signature/link/isolation tests PASS; Meta acceptance BLOCKED |
| WhatsApp outbound | `WHATSAPP_OUTBOUND=cloud`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_API_VERSION` | Existing generic service notification transport, opt-in and open messaging window required | Local transport tests PASS; real delivery BLOCKED |
| Email option: Resend | `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` | Verified sender domain/address; transactional fixed-text adapter only | Adapter tests PASS; verified-recipient workflow and queue wiring unfinished |
| Push option: FCM | `PUSH_PROVIDER=fcm`, `FCM_SERVICE_ACCOUNT_JSON`, `NOTIFICATION_ENCRYPTION_KEY` | Firebase project service account with messaging permission; 32-byte base64 encryption key | Backend lifecycle/adapter tests PASS; client registration/real delivery BLOCKED |
| Video | Existing `VIDEO_PROVIDER_KEY`, `VIDEO_PROVIDER_SECRET` placeholders | A provider must first be selected; setting placeholders enables nothing | BLOCKED pending provider |
| Storage | Existing `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` placeholders | No production upload or signed-media adapter is enabled | BLOCKED; signed-media implementation remains |
| Monitoring | Existing request IDs, route metrics and worker logs | An external destination, alert recipients and retention must be selected | Local metrics only; deployment NOT TESTED |

## Environment separation

- Development: loopback services, explicit `OTP_MODE=development`, random local
  codes, explicitly labelled simulated payments. Provider keys are unnecessary.
- Staging: separate PostgreSQL and secrets; production runtime guards; approved
  provider sandbox accounts and designated test recipients only. No live debits.
- Production: separate live accounts, approved sender identities, consent,
  domains, webhook registrations and operational owners. No development OTP,
  simulated payment or demo catalogue modes.

An SMS provider error leaves its challenge consumed/unusable and returns 503.
The code is activated only after provider acceptance. Acceptance is not proof
of delivery. No automatic SMS POST retry occurs; request limits remain in force.
All roles continue to use the original OTP/session service.

## Doctor browser session

The Doctor Portal web application has been removed. The following describes the
retained backend contract, not an available client. Do not provision a doctor
web deployment from this repository or retain retired origins in CORS.

`POST /api/v1/doctor/session` exchanges the existing verified opaque session for
an HttpOnly, SameSite=Strict cookie. Production/staging cookies are Secure and
scoped to `/api/v1/doctor`. Deploy portal and API on same-site HTTPS domains,
such as doctor.example.com and api.example.com; configure exact `CORS_ORIGINS`.
Cookie requests require an approved Origin or browser same-origin provenance.
Mobile and admin bearer authentication remain unchanged. No token is written to
localStorage or sessionStorage. GET restores profile/status; DELETE revokes the
same database session. Missing and pending profiles do not receive appointments.

## Push devices and worker

Authenticated `POST /api/v1/me/push-device` registers/refreshes the current
session's token with `{token, platform, enabled}`. DELETE removes it. Token values
are encrypted with AES-256-GCM; responses contain metadata only. Logout/session
deletion cascades registrations. Global communication consent and per-device
opt-in are checked again immediately before dispatch. No backlog is created for
events before registration/refresh. In-flight provider acceptance cannot be
recalled by a later opt-out.

Existing PostgreSQL outboxes are reused; no Redis/BullMQ was introduced. Source
keys prevent duplicate jobs, row locks coordinate workers, attempts are bounded
and failed sends back off. An uncertain send becomes UNKNOWN and is not blindly
retried. Provider acceptance is SENT, not DELIVERED. FCM UNREGISTERED removes the
obsolete destination. Push previews contain no names, diagnoses, amounts or
appointment details. Firebase app files, platform permission/token-refresh hooks,
APNs for iOS and end-to-end device validation remain required.

## Payment and communication boundaries

Razorpay callback verification and provider fetches compare amount, currency,
order and payment references. Webhooks validate raw signatures and resource
prefixes, persist a unique event, and leave fulfilment pending reconciliation.
Customer checkout and captured-event domain fulfilment are still unwired.
Recurring subscriptions/mandates are not enabled; existing manual renewal is
preserved. Do not activate live payments merely by supplying keys.

WhatsApp inbound messages remain account-scoped and can produce in-app assistant
responses. Conversational WhatsApp response delivery is still unfinished; the
existing outbound notification adapter sends generic service updates only.

Email currently has no verified user-email collection/consent workflow or worker
recipient binding. The adapter cannot be used through an arbitrary-recipient API.
Its stable idempotency key follows the provider's 24-hour retention window; a
future worker must retain delivery state beyond that window and reconcile unknown
outcomes instead of assuming indefinite provider deduplication.

## Provider contract references

- [Twilio Messages resource](https://www.twilio.com/docs/messaging/api/message-resource)
- [Resend idempotency retention](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [FCM HTTP v1 authentication and sending](https://firebase.google.com/docs/cloud-messaging/send/v1-api)

These documents describe contracts. They do not establish account approval or
successful delivery for Pocket Doctor.
