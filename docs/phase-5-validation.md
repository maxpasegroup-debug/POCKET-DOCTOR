# Phase 5 local validation

Environment: Windows, Flutter 3.44 / Dart 3.12, Node 24, Prisma 7.10, isolated PostgreSQL. No production services or real health records were used.

**Phase status: COMPLETE for the locally validated assistant and provider-ready WhatsApp scope.** No production messaging, medical compliance or unrestricted AI capability is claimed.

| Check | Result |
|---|---|
| Flutter full suite | 71 passed after the browser-discovered navigation fix; all six live API smoke flags enabled; no skips |
| Backend full suite | 65 passed; real isolated PostgreSQL; no skips |
| Doctor portal | 8 tests passed; production build passed |
| Flutter analysis | No issues found |
| Android debug | Final rebuild passed; APK 230,307,197 bytes |
| Prisma validation | Passed |
| Database migrations | All six migrations applied, including additive Phase 5 migration |
| Database/schema drift | No difference detected |
| API liveness/readiness | HTTP 200; Phase 5; database ready |
| Backend final build/type-check | Passed |
| Metadata cleanup | Passed on the isolated database; zero eligible/deleted rows |
| Web debug build | Final rebuild passed; main.dart.js 13,483,288 bytes; earlier Wasm dry run also passed |
| Browser validation | Passed: sign-in/profile restore, consent, chat, safe prescription boundary, persistent history, doctor tab navigation and goal creation |
| Dart formatting | 83 files checked; zero changes |
| Source inventory scan | 24 new / 17 modified files; none missing; no private-key/live-key patterns detected |

## Coverage

Existing Phase 0–4 suites were retained. New tests cover chat authentication and consent, strict inputs, provider response schema/byte limits, timeout and failure, idempotent messages, conversation/memory deletion, goal/check-in/reminder CRUD, cross-user isolation, product/program/consultation/order grounding, safety routing, prompt injection, per-user quotas, raw webhook signatures, linking expiry/single-use, app confirmation, identity uniqueness and disconnect.

Flutter tests cover loading, errors, retry with draft preservation, chat sending, doctor navigation, history deletion, memory/goals/check-ins/reminders, goal validation, optional check-ins, privacy preferences, unavailable WhatsApp, and all new routes in existing narrow/landscape/2x-text layout checks. A live assistant smoke journey creates actual records and deletes its conversation/memory. Synthetic wellness records remain only in the isolated test database.

## Known validation limits

Real OpenAI and official WhatsApp delivery were not called. Provider requests were validated with controlled transports; WhatsApp webhook/linking tests use locally signed synthetic payloads. No production push, payment, shipment or consultation occurred. No physical-device or iOS testing was performed. No deployment or regulatory-compliance claim is made.

Prior backend suites still emit the existing pg concurrency deprecation warning; it is non-failing and should be reviewed before a future pg major-version upgrade. One local tooling JSON error printed disposable credentials; those were rotated and the loader was repaired. Application request logging was verified separately to exclude message bodies.

Automatic approval review initially rejected the cleanup-command test because its database target was not proven disposable. Read-only evidence then confirmed `pocket_doctor_test` on loopback port 55433, a task-created workspace data directory, development mode and zero eligible rows. The same command was approved on retry and removed zero records.

Browser evidence is saved in ignored artifacts: `phase5-assistant-home.png`, `phase5-chat-safety.png`, `phase5-doctor-navigation-before.png`, `phase5-doctor-navigation-after.png`, `phase5-goal-form.png`, and `phase5-goal-saved.png`. The before screenshot records the assertion caught during exploratory testing. Both the real-router widget regression and final rebuilt-browser doctor navigation now pass. Flutter's semantics layer required explicit input focus and a visible-coordinate click for the goal form; the form itself saved successfully through the real API.

The final web build used `--debug --no-wasm-dry-run --dart-define=API_BASE_URL=http://127.0.0.1:3000/api/v1 --dart-define=SHOW_DEVELOPMENT_OTP=true`. The earlier Phase 5 web build included the successful Wasm dry run. Android debug, backend, and doctor portal builds all exited successfully.

Five simultaneous signed-identity WhatsApp requests also pass after sharing a transaction across the inbound and assistant services. The final backend suite was rerun after that fix: 65 passed, no skips.

After validation the isolated browser, API, web preview and PostgreSQL instance were stopped. Temporary runtime credentials and the API PID file were removed; ignored synthetic database files and screenshots remain for evidence. No Git repository existed, so no Git initialization or commit was performed. Phase 6 was not started.
