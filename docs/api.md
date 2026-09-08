# API contract — Phase 1

Phase 3 adds discovery, slots, consultation booking/payment/history and assigned
doctor operations. See [the Phase 3 endpoint table](phase-3.md#api-contract).

Base: /api/v1. Success: `{data: ...}`. Error:
`{error: {code, message, requestId}}`. No credentials, body contents or raw URLs
are logged. Responses include no-store and an API-generated x-request-id.

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| GET | /health | Public | Liveness, service name, phase 1 |
| GET | /health/ready | Public | Prisma connection probe; 503 if unavailable |
| POST | /auth/otp/request | Public | Validated E.164 India phone → challenge, expiry and resend delay |
| POST | /auth/otp/verify | Public | challengeId + six-digit code → token, expiresAt and user |
| GET | /auth/session | Bearer | Validates session and returns current user |
| POST | /auth/logout | Bearer | Revokes current session; returns loggedOut |
| GET | /users/me | Bearer | Returns only the caller's profile DTO |
| PATCH | /users/me | Bearer | Validates and saves caller's complete basic profile |

OTP request accepts `{phone: "+91…"}`. Local development response contains
`challengeId`, `expiresInSeconds`, `resendAfterSeconds`, `delivery: "development"`
and a random `developmentCode`. No fixed OTP is accepted. Production delivery is
unavailable. Codes expire in five minutes, permit five attempts and are single-use.
Resend replaces the old challenge. Phone requests are limited to five per hour and
one per minute, with additional per-IP route limits.

Profile PATCH accepts exactly `fullName` (trimmed 2–100 characters), `language`
(en/hi/ml/ta/te/kn/mr/bn), unique `interests` from the documented ten options, and
`notifications` boolean. It rejects IDs, roles and all other fields. An empty interests
array removes choices. No birth date, gender or medical history is collected.

User DTO: id, phone, fullName, language, interests, notifications, profileComplete
and server-derived roles. Session hashes and OTP material never appear in the user
DTO. Self-only paths eliminate arbitrary user IDs. Session tokens are opaque and
expire after seven days; only their hashes are stored.

Errors: 400 INVALID_REQUEST/INVALID_OTP/INVALID_PROFILE, 401 UNAUTHENTICATED,
403 FORBIDDEN, 404 NOT_FOUND, 429 RATE_LIMITED/OTP_RATE_LIMITED, 500 INTERNAL_ERROR,
503 OTP_UNAVAILABLE/SERVICE_UNAVAILABLE/NOT_READY. Failed OTP attempts do not expose
account existence. Client messages never display raw backend exception strings.

CORS allows exact configured origins and GET/POST/PATCH. It does not authenticate.
Bearer transport is used; there are no credentialed browser cookies and no tokens
in browser persistent storage. Configure a suitable cookie/CSRF architecture before
turning the validation web target into a production customer website.

## Reserved domain ownership

| Prefix | Owner / later boundary |
| --- | --- |
| /programs | Implemented Phase 2 learning discovery, details and enrollment |
| /doctors | Verified partner professional profiles |
| /consultations | Participant/assigned-doctor care access |
| /products | Curated catalog |
| /orders | Commerce with self-only access |
| /assistant | Consenting user's bounded companion data |
| /membership | Entitlements and billing reconciliation |
| /health | Future consent-controlled health records |

The program API is documented in [Phase 2](phase-2.md), consultations in
[Phase 3](phase-3.md), and Wellness commerce in [Phase 4](phase-4.md#api).
Commerce uses `/wellness/products` and owner-scoped cart/address/order routes;
it adds DELETE to the exact-origin CORS allowlist. Other future APIs remain
unimplemented and return 404. Add explicit request/response
schemas, pagination caps, idempotency where necessary, resource authorization and
integration tests with each later workflow. Do not expose Prisma records directly.
