# Phase 5 — Personal AI Health Assistant + WhatsApp

Pocket Doctor Assistant supports everyday wellness, personal organization and navigation. It is not a doctor. Phases 0–4 remain in place; no membership, full admin, deployment or Phase 6/7 work is included.

## Local setup

Use the existing PostgreSQL database and API configuration. Apply migrations with `npm run db:deploy` from `services/api`, then `npm run build` and `npm start` (or `npm run dev`). Back up any non-disposable database before migrating it.

The root `.env.example` documents backend configuration. Set `AI_PROVIDER=development` for explicit local demo responses. This mode is rejected in staging, production and `NODE_ENV=production`. The default is `disabled`, which shows an honest unavailable state. No seed health data is needed.

For OpenAI, configure `AI_PROVIDER=openai`, `AI_MODEL`, and `AI_API_KEY` on the backend. The deployment operator chooses a Structured Outputs compatible model. No model or provider credential is compiled into Flutter. `AI_TIMEOUT_MS` defaults to 8000 (maximum 9000); `AI_MAX_OUTPUT_TOKENS` defaults to 256 (maximum 1000). Real provider credentials were not used during local validation.

Run Flutter as before:

```powershell
cd apps/mobile
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:3000/api/v1 --dart-define=SHOW_DEVELOPMENT_OTP=true
```

Use the existing Android-emulator host mapping or configured device address when needed. Development OTP remains explicitly local. Open Assistant → Privacy & settings → Allow chat processing before ordinary chat. Safety routing works locally even when the external provider is disabled.

## Conversation pipeline

Authenticated USER → strict input validation → conversation ownership → per-user PostgreSQL lock and quota → local safety routing → consent → bounded provider classification → strict output validation → authorized context tools → reviewed response rendering → persisted message pair → Flutter.

`AIProvider` is vendor independent. `DevelopmentAIProvider` is a labelled deterministic demo. `OpenAIProvider` uses the Responses API with `store:false`, JSON Schema Structured Outputs and no model tools. The model selects one of a fixed set of support intents. It cannot supply response prose, SQL, URLs, account identifiers, tool arguments or mutations. Unknown fields, refusals, incomplete responses, oversized payloads and provider errors fail closed.

This phase deliberately uses reviewed response templates and authenticated facts, not unrestricted generated health advice. This reduces expressiveness: new educational topics need reviewed copy and additional tests. It does not establish clinical safety or regulatory compliance. Safety keyword detection is defense in depth, not a validated clinical classifier. It has English and limited Hindi patterns; broader language evaluation is a production dependency.

The provider sees the current message (maximum 2,000 characters) and at most four prior user messages truncated to 500 characters each. Account facts, private notes, goals, tracking values, addresses and memory are never sent to the model. No full database serialization, raw provider persistence, external analytics, hidden tool loops or automatic retries occur. Plain text and typed actions are rendered; arbitrary model Markdown/HTML is not executed.

## Safety and escalation

Emergency/self-harm matches receive immediate in-person/local-emergency-service guidance. The assistant gives no treatment instructions, diagnosis or false reassurance. The response does not offer an online booking as an emergency alternative. Medication, diagnosis and symptom requests receive a professional-care boundary and a user-operated Talk to a Doctor action. No booking, prescription, purchase, reminder or memory is created by AI output.

Appointment preparation is labelled AI-assisted organizing material, based on user-described concerns. It is not transmitted to doctors. Doctor notes and clinical summaries are excluded from context queries.

## Controlled tools and grounding

`AIContextBuilder` binds the authenticated user ID once; the model cannot supply another identity. Its exhaustive intent switch supports:

- Programs: at most five published enrollments, actual completed/required lesson counts and the next live session. Shared publishing rules and verified paid entitlements apply. Lesson media and content are not queried.
- Consultations: the user's upcoming confirmed/in-progress appointments, doctor display name, time and status only.
- Orders: the user's five most recent order IDs and statuses; no shipping address or payment credentials.
- Products: at most five visible, approved, unrestricted products with stored price, availability and materials. Shared catalogue visibility rules apply. This is catalogue navigation, not treatment recommendations.
- Goals and explicit memory: self-reported targets/progress; memory is shown only when the user enables it.
- Reminders: the user's own saved items and due times.

No raw query text or provider response can choose an admin operation. Queries use the existing transaction connection to avoid exhausting the small database pool.

## Data and privacy

Additive Prisma models: `AIConversation`, `AIMessage`, `AIMemory`, `WellnessGoal`, `WellnessCheckIn`, `Reminder`, `AIPreferences`, `WhatsAppIdentity`, `WhatsAppLinkToken`, `AIAuditEvent`, `WhatsAppReceipt`.

Each personal record is owned by a User or by an owned conversation. Foreign keys cascade these records on eligible User deletion. Existing consultation/order retention constraints still apply: this phase does not implement complete account deletion or legal portability. Conversation deletion cascades messages. Memory can be added, edited, deleted individually or cleared. Deleting memory does not erase text already present in conversations; the UI explains the distinction. Goals, check-ins and reminders are also editable/deletable. Check-ins upsert by user and calendar date.

Data is stored in PostgreSQL; no claim of field-level encryption is made. Deployed database encryption, backup retention, consent wording, processor agreements, account deletion orchestration and access auditing require production review. Chat processing consent is separate from explicit memory use and reminder preferences.

Audit records contain event type, safety classification, time and owning user ID, never prompt/response bodies or health values. Standard request logs contain route templates and statuses. `npm run assistant:cleanup` removes expired linking tokens, receipts older than eight days and audit metadata older than 30 days. Scheduling that command remains an operations task; it never deletes user conversations automatically.

## Cost and reliability

Existing Fastify rate limiting remains in use; chat has a 15-request/minute IP limit. PostgreSQL-backed quotas additionally cap each user at 10 attempted provider/safety messages per minute and 100 per rolling day across API instances/IP changes. Provider failures consume an attempt but create no fabricated answer. Up to 100 message pairs per conversation and 100 conversations per user are allowed; list APIs are paginated. Memory is limited to 100 entries. Context and output bytes are bounded. The client retains a failed draft and reuses an idempotency key for the same send. Successful retries do not duplicate the message or provider call.

No full offline history or downloads are implemented. Existing auth state, secure session storage, HTTP errors and 401 handling are reused. Chat and personal-data Riverpod providers depend on the current identity, so account changes invalidate their data.

## Wellness and reminders

Goals have user-defined title/target, start/optional target date, progress and ACTIVE/PAUSED/COMPLETED status. Check-ins optionally record mood, energy, sleep, water, activity, weight and a chosen habit; no medical scoring or clinical interpretation occurs. Wellness-plan responses offer an editable idea through explicit goal/reminder forms, not an automatically saved treatment plan.

Reminders are one-off backend records with PERSONAL/WELLNESS/PROGRAM/CONSULTATION categories. A due-events API merges user reminders with the existing Phase 3 `ConsultationReminder` outbox, respecting app/category preferences. It does not introduce a second delivery worker. Due items appear when the assistant opens or refreshes. No background push, OS alarms, recurring scheduler or WhatsApp delivery is claimed.

## WhatsApp architecture

Official WhatsApp Cloud webhook contract only. `WHATSAPP_MODE=webhook` requires `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (at least 32 characters), and `WHATSAPP_PHONE_NUMBER_ID`. A scoped raw-body parser verifies `x-hub-signature-256` over exact bytes using constant-time comparison before processing any message. GET subscription verification checks the configured token. Business phone-number ID is checked. Inbound text is bounded; stale messages outside 24 hours are ignored. Provider message IDs are deduplicated in PostgreSQL.

Linking is explicit and has two confirmations:

1. An authenticated app user generates a 256-bit random code; only its hash is stored, with a five-minute expiry.
2. The user sends `LINK <code>` through the official provider. A signed inbound message nominates the WhatsApp identity and consumes that nomination opportunity.
3. The signed-in app displays the candidate number suffix and requires explicit confirmation. The code is then deleted; a WhatsApp identity is unique across accounts.
4. Disconnect removes identity and pending token and disables WhatsApp reminders.

A familiar phone number alone never authenticates anyone. The same assistant service and account authorization process linked messages. Messages appear in a daily app conversation; deterministic request IDs protect retries. The webhook returns an acknowledgment only, never private assistant content in its HTTP response.

`WhatsAppProvider` defines the outbound boundary; `UnconfiguredWhatsAppProvider` honestly reports no delivery. No actual outbound adapter or credentials were connected. Production delivery requires official Business API onboarding, account verification, message-window/template enforcement, opted-in reminders, durable queue/retry handling, provider testing and privacy review. No bulk, promotional or unofficial WhatsApp automation exists. Linking/webhook architecture is locally tested; WhatsApp production messaging is **not operational**.

## APIs

All paths use `/api/v1`. App endpoints require a USER session. Bodies are strict Zod contracts; no caller-supplied `userId` is accepted.

| Domain | Endpoints |
|---|---|
| Status | GET `/ai/status` |
| Conversations | GET/POST `/ai/conversations`; GET/DELETE `/ai/conversations/:id`; POST `/ai/conversations/:id/messages` |
| Memory | GET/POST/DELETE `/ai/memory`; PATCH/DELETE `/ai/memory/:id` |
| Goals | GET/POST `/me/goals`; PATCH/DELETE `/me/goals/:id` |
| Check-ins | GET/POST `/me/check-ins`; DELETE `/me/check-ins/:id` |
| Reminders | GET/POST `/me/reminders`; PATCH/DELETE `/me/reminders/:id`; GET `/ai/reminder-events` |
| Preferences | GET/PATCH `/ai/preferences` |
| WhatsApp linking | GET/POST/DELETE `/integrations/whatsapp/link`; POST `/integrations/whatsapp/confirm` |
| Official provider | GET/POST `/integrations/whatsapp/webhook` (provider verification, not session authentication) |

List history, goals, check-ins and reminders accept `page` and return up to 20 items. Writes return stored data or an explicit saved acknowledgment. A message body contains `text` and UUID `requestKey`; the response contains a validated reply and message ID. Provider failures return friendly errors and keep the client draft.

## Flutter

`features/assistant/{domain,data,application,presentation}` extends the existing feature architecture. Routes: `/assistant`, `/assistant/history`, `/assistant/chat/:id`, `/assistant/memory`, `/assistant/goals`, `/assistant/check-ins`, `/assistant/reminders`, `/assistant/settings`, `/assistant/whatsapp`. All use existing GoRouter protection. `/my-consultations` opens the existing Upcoming tab.

Riverpod providers cover repository/identity, history, chat, records, preferences, provider status, WhatsApp status, due events and asynchronous actions. Home keeps all four services. My Health links to goals and check-ins; existing navigation and branding remain intact.

## Validation

See [phase-5-validation.md](phase-5-validation.md) for actual results and [phase-5-files.md](phase-5-files.md) for the file inventory.

```powershell
cd services/api
npm test
npm run typecheck
npm run db:validate
npm run build
cd ../../apps/mobile
flutter analyze
flutter test
flutter build apk --debug
flutter build web --debug
```

For real PostgreSQL integration tests use an isolated database with `AUTH_INTEGRATION=true`. Full Flutter smoke validation also enables `RUN_API_SMOKE`, `RUN_AUTH_SMOKE`, `RUN_PROGRAM_SMOKE`, `RUN_CONSULTATION_SMOKE`, `RUN_COMMERCE_SMOKE`, and `RUN_ASSISTANT_SMOKE` through `--dart-define` against the local demo backend. Default smoke tests skip intentionally when no server is configured.

## References and next boundary

The OpenAI request contract follows [Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs). The raw-signature/subscription-verification contract follows [Meta's official webhook reference](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/); that SDK is archived and is not installed here. Current provider onboarding, messaging policies and delivery implementation must be checked before enabling a real transport.

Phase 6 is not started. Existing production dependencies remain: real SMS/OTP, approved logo asset, payments/video/shipping integrations, deployment, iOS/physical devices and formal security/privacy/medical-content evaluation. This phase adds real-provider evaluation and operational WhatsApp delivery to that list.
