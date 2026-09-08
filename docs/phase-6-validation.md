# Phase 6 validation — 8 September 2026

Validation uses an isolated local PostgreSQL database, synthetic accounts and explicitly labeled demo payments. No SMS, live payment, consultation, shipment, external AI, WhatsApp or promotional message was sent.

## Results

| Check | Result |
| --- | --- |
| Flutter analysis | PASS — no issues |
| Flutter full suite | PASS — 83 tests; all seven live API smoke flags enabled; no skips |
| Backend full suite | PASS — 83 tests; real PostgreSQL integration enabled; no skips |
| Doctor portal tests | PASS — 8 tests |
| Doctor portal build | PASS — TypeScript and Vite production build |
| Backend typecheck | PASS |
| Backend build | PASS — Prisma generation, npm build and final TypeScript compilation |
| Prisma schema validation | PASS |
| Database migrations | PASS — all nine migrations applied to the isolated database |
| Prisma schema drift | PASS — no difference detected |
| API startup | PASS — health reports phase 6 on dedicated loopback port 3006 |
| Web build | PASS — debug build, Wasm compatibility dry run, and final navigation rebuild |
| Android debug build | PASS — final navigation build completed in 57.7 seconds |
| Browser | PASS — signup/profile, membership, checkout, verified demo payment, cancellation, receipt, fresh-login restoration and final Home-button navigation |

Final artifacts: Android `app-debug.apk` is **230,343,268 bytes**; web `main.dart.js` is **13,579,085 bytes**. Final web compilation completed in 65.4 seconds. The targeted membership suite (18 tests) additionally passed after explicit total/monthly aggregation assertions were added. A source inventory/pattern scan found all 25 created files, 29 modified files and no matching private-key/live-key patterns.

## Commands

From `apps/mobile`:

```sh
flutter analyze
flutter test --concurrency=1 \
  --dart-define=API_BASE_URL=http://127.0.0.1:3006/api/v1 \
  --dart-define=RUN_API_SMOKE=true \
  --dart-define=RUN_AUTH_SMOKE=true \
  --dart-define=RUN_PROGRAM_SMOKE=true \
  --dart-define=RUN_CONSULTATION_SMOKE=true \
  --dart-define=RUN_COMMERCE_SMOKE=true \
  --dart-define=RUN_ASSISTANT_SMOKE=true \
  --dart-define=RUN_MEMBERSHIP_SMOKE=true
flutter build web --debug \
  --dart-define=API_BASE_URL=http://127.0.0.1:3006/api/v1 \
  --dart-define=SHOW_DEVELOPMENT_OTP=true
flutter build apk --debug --dart-define=API_BASE_URL=http://10.0.2.2:3006/api/v1
```

Commands are shown with POSIX continuation for readability; on PowerShell run each as one line. The final web rebuild uses `--no-wasm-dry-run` because the unchanged dependency set already passed the dry run. API port 3006 and preview port 8086 keep this validation separate from the existing local port 3000 process.

From `services/api`, with the isolated DATABASE_URL and `AUTH_INTEGRATION=true` supplied privately:

```sh
npm run typecheck
npm run build
npm test
npm run db:validate
npm run db:deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

From `apps/doctor-portal`: `npm test` and `npm run build`.

## Security and integration evidence

- Two simultaneous subscription attempts produce one pending subscription; unique SQL constraints back the transaction lock.
- Four concurrent callbacks for the same payment produce one verified payment, activation event and receipt.
- Coupon tests cover valid/expired/unknown/wrong-plan offers, per-user use, global concurrent limits, reservation and replay.
- Entitlements deny free and expired accounts, allow active members and preserve cancelled paid terms. Tests exercise renewal retry, agreed pricing, grace expiry and single-use trials.
- Cross-user subscription cancellation, payment settlement, invoices and transaction/history access are denied or return only the owner's records. USER access to ADMIN reporting is denied.
- Tests exercise real program lesson access, membership expiry, later independent program purchase, wellness cart/member pricing and consultation booking fees. All earlier authentication, profile, programs, consultation, commerce, AI and WhatsApp tests also pass.
- Flutter membership widget coverage includes backend prices/benefits, coupon quote, payment success/failure, current state, cancellation, expiry, transactions, receipts, direct Home navigation and a 320-pixel viewport at 200% text scale. Existing navigation tests cover phone, landscape and tablet sizes.

## Browser evidence

The agent-browser skill was used with an isolated `pocket-doctor-phase6` session at 390×844. A synthetic customer completed the existing development OTP/profile flow. Random OTP values were kept out of output and were not saved to browser auth-state files.

Ignored workspace evidence:

- `artifacts/phase6-checkout-ready.png` — price, renewal price, demo label, cancellation disclosure and coupon field.
- `artifacts/phase6-confirmation.png` — ACTIVE membership after verified demo payment.
- `artifacts/phase6-cancelled.png` — CANCELLED state with benefits retained until the paid end date.
- `artifacts/phase6-receipt.png` — owned verified receipt, demo label and explicit absence of tax-invoice claims.
- `artifacts/phase6-manage-final.png` — restored cancelled membership in the final web build, with a Home action.
- `artifacts/phase6-return-home.png` — Home action returns to the existing shell with all four services.

No browser errors were reported through the final return to Home. The review found a missing Home action on the root confirmation page; this is fixed, covered by a widget regression test and verified in the rebuilt browser app. A fresh login restored the cancelled-but-active membership and its benefits from PostgreSQL.

## Issues resolved during validation

- A generated test coupon initially exceeded its declared maximum length; the fixture was corrected and the unused synthetic plan records were hidden.
- The resumed development session had stopped the disposable database; it was restarted before rerunning integration checks.
- The Home/Profile membership card required its own Material surface to support ListTile ink. The production widget was corrected.
- Existing widget fixtures initially lacked the new membership repository dependency, causing real HTTP retry timers. They now supply a fake membership repository; the full suite passes.
- Analyzer-required braces were added to new Dart code and test helpers.
- Review fixed independent program purchase after membership expiry and a direct Home action after checkout.
- PowerShell formats Flutter's successful Wasm advisory on stderr as a NativeCommandError block; the build's actual exit status was zero and its output confirmed success.
- The pre-existing `pg` concurrent-query deprecation warning remains in some prior service tests. It is non-failing and is not a claim of compatibility with a future pg major version.

## Cleanup and repository state

The isolated browser was closed. Three verified Phase 6 API/preview processes were stopped, followed by the workspace-owned PostgreSQL instance on port 55433. The temporary runtime credential JSON and PID file were removed; ignored synthetic database files and validation evidence were retained. No unrelated project files or processes were changed. Git is not configured, so no repository was initialized and no commit was created.

## Production limits

These are local development/provider-ready results. No iOS/physical-device validation, production deployment, live recurring billing, real refunds, tax/legal certification or final security audit is claimed. Phase 7 has not been started.
