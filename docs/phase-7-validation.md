# Phase 7 validation and production readiness

Validation date: 2026-09-08, Windows development workstation. Tests use an
isolated PostgreSQL database and explicitly labelled demo fixtures. Provider
contract tests use stubbed transports. No real payment or external message was
sent. Build-time HTTPS example domains are not deployed endpoints.

## Evidence ledger

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Backend regressions | **PASS** | 106 tests, zero skipped; includes Phases 0–6 and admin-login/MFA/privacy/provider/refund/delivery tests |
| Backend TypeScript | **PASS** | `tsc --noEmit` and compiled backend build |
| Flutter regression | **PASS** | 89 tests including all seven real HTTP smoke journeys against local API |
| Flutter analysis/format | **PASS** | No analyzer issues; 98 files checked with no format changes |
| Admin console | **PASS** | 16 tests; TypeScript + Vite production build |
| Doctor portal | **PASS** | 8 tests; TypeScript + Vite production build with HTTPS release configuration |
| Static web server | **PASS** | SPA route, cache/CSP, MIME/HEAD, method and traversal test |
| Admin browser QA | **PASS — scoped** | Synthetic sign-in, program edit/restore, search, retry, logout/protected navigation; 375/390/768/1440px; final scoped axe scans had no violations |
| Prisma validation | **PASS** | Schema validates; 13 migrations deployed; datasource/schema comparison reports no difference |
| Database recovery | **PASS — local** | Restore to separate DB; 13 migrations, six table-count comparisons and three protection triggers; runtime grant checks passed |
| Worker | **PASS — local** | Bounded one-cycle run with external delivery disabled; durable worker paths exercised in integration tests |
| Phase 7 actual HTTP | **PASS** | Compiled API readiness, privacy, six export categories, consent, inbox and access-deletion/session invalidation with a synthetic account |
| Android debug | **PASS** | Multi-ABI debug passed; final source also built as ARM64 debug with reduced memory settings (128.9 seconds) |
| Flutter web release | **PASS — compile** | `--release --no-web-resources-cdn`, explicit HTTPS example API; runtime service acceptance remains blocked |
| Android unsigned release | **PASS — ARM64 compile** | Final isolated build completed in 214.5 seconds; 19.0 MB APK, production HTTPS example configuration, obfuscation/split symbols; signature inspection confirms unsigned (no debug-key fallback), backup/cleartext flags disabled |
| Signed Android/store release | **BLOCKED** | Private signing, owned package/store identity, approved logo and device acceptance unavailable |
| iOS | **BLOCKED** | No macOS/Xcode/device/signing environment |
| Source secret-pattern scan | **PASS — scoped** | No candidates in inspected source/config/docs; temporary test runtime credentials removed; ignored pre-existing local secrets, Git history and external secret stores are outside this check |
| Dependency advisories | **PASS — npm scope** | API, admin and doctor portal each reported zero vulnerabilities; no claim of comprehensive Flutter/native/container advisory coverage |
| Flutter dependency freshness | **PASS — inventory only** | `dart pub outdated --no-dev-dependencies` completed; newer secure-storage/video-player and transitive versions noted, lockfile preserved |
| Docker/Railway/public TLS | **BLOCKED** | Deployment accounts/runtime and actual ingress not supplied; Docker deployment not exercised |
| GitHub CI execution | **NOT TESTED** | Workflow updated; no Git repository configured or remote CI run |

Admin browser QA does not cover every domain mutation or complete assistive
technology workflows. API tests validate ownership and existing doctor journeys,
but this is not a new physical doctor/device session or live video acceptance.
See [the security audit](phase-7-security-audit.md) for limitations and resolved
findings, including the recorded synthetic-OTP tooling incident.

Final source scan inspected 293 source/config/document files with no candidates.
All 11 checked documentation files had valid local links; all nine legal metadata
placeholders passed configuration validation and remain explicitly unapproved.
The isolated API, preview and database were stopped; their temporary runtime
credential file and downloaded utility archive were removed. Synthetic recovery
evidence and ignored reusable PostgreSQL utilities remain local.

## Commands

With a separately configured isolated test database:

```powershell
# services/api (APP_ENV=test, AUTH_INTEGRATION=true, DATABASE_URL provided privately)
npm ci
npm run build
npm run typecheck
npm run db:validate
npm run db:deploy
npm run db:check
npm test
npm audit --audit-level=high
# Read-only drift check:
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

```powershell
# apps/mobile; use the existing loopback development API and all demo seeds
flutter analyze
dart format --output=none --set-exit-if-changed lib test
flutter test --concurrency=1 --dart-define=API_BASE_URL=http://127.0.0.1:3007/api/v1 --dart-define=RUN_API_SMOKE=true --dart-define=RUN_AUTH_SMOKE=true --dart-define=RUN_PROGRAM_SMOKE=true --dart-define=RUN_CONSULTATION_SMOKE=true --dart-define=RUN_COMMERCE_SMOKE=true --dart-define=RUN_ASSISTANT_SMOKE=true --dart-define=RUN_MEMBERSHIP_SMOKE=true
flutter build apk --debug
flutter build web --release --no-web-resources-cdn --dart-define-from-file=config/production.example.json
flutter build apk --release --target-platform android-arm64 --dart-define-from-file=config/production.example.json --obfuscate --split-debug-info=build/symbols
# The last command does not provide a signing key or validate a store release.
```

```powershell
# Each portal independently, with explicit VITE_API_BASE_URL and no development OTP
npm test
npm run build
npm audit --audit-level=high
# Repository root
node ops/scan-secrets.mjs
node --test ops/test/*.test.mjs
```

## Production readiness matrix

| Area | Local engineering | Remaining release gate |
| --- | --- | --- |
| Identity/session | PASS | BLOCKED — implement production SMS adapter, provider and abuse acceptance |
| Admin/MFA | PASS | BLOCKED — real admin provisioning/recovery, deployed role/ingress review |
| User/doctor/profile | PASS | BLOCKED — verified real professional records, operational sign-off |
| Programs | PASS | BLOCKED — approved medical content, signed media delivery, withdrawal policy |
| Consultation | PASS controlled lifecycle | BLOCKED — approved video provider and physical-device/live workflow |
| Wellness/orders | PASS demo lifecycle | BLOCKED — approved products, tax/fulfilment/shipping/refund policy |
| Membership | PASS demo lifecycle | BLOCKED — live recurring settlement/mandates and disclosures |
| Payments | PASS adapter/intent verification | BLOCKED — customer checkout, domain reconciliation/fulfillment wiring and sandbox/live provider acceptance |
| AI | PASS local safety/ownership matrix | BLOCKED — live model/configuration, clinical/privacy review and adversarial acceptance |
| WhatsApp | PASS signed webhook/outbound contract | BLOCKED — approved business configuration, real delivery/status/disconnect acceptance; conversational outbound remains unavailable |
| Notifications | PASS inbox/worker | BLOCKED — deployed worker/alerts, actual external-channel verification; push/email unconfigured |
| Consent/privacy | PASS local controls | BLOCKED — approved documents, required-acceptance onboarding, retention-case completion and deletion/anonymization policy |
| Export | PASS owner-scoped pages | Packaged full export/operational fulfillment remains unfinished |
| Database | PASS migrations/drift/local restore | BLOCKED — deployed runtime permissions, encrypted off-site schedule/PITR/recovery objectives |
| Security/observability | PASS scoped controls | BLOCKED — independent assessment, realistic capacity/load and external monitoring/alerts |
| Android/web | PASS compile as listed above | BLOCKED — actual API, signing/store/device and production browser acceptance |
| iOS | BLOCKED | macOS/Xcode/signing and physical-device validation |
| Legal/brand/business | BLOCKED | Named owners, approved logo/assets, policies, credentials and launch decision |

## Failures addressed and remaining warnings

The initial 320px notification overflow and Android debug manifest merge failure
were fixed and their checks passed afterward. Backend test isolation was corrected
for historical provider fixtures and TOTP window rollover. A test with 61
simultaneous database requests hit the small local pool under concurrent release
compilation; the correctness test now races two replicas at the final allowance,
without changing production limits or timeouts. This is not a load-test pass.

The original Android template allowed an 8 GB heap plus 4 GB metaspace. It now
uses a 2 GB heap, bounded metaspace, two workers and no persistent new daemon.
Two earlier release attempts caused workstation pressure and were stopped.
After confirming and removing their orphaned workspace compiler daemons, the
final isolated ARM64 release completed successfully. No signed store-release
success is claimed. No security control was disabled.

The current PostgreSQL adapter emits a pg@9 future concurrency-deprecation
warning. Flutter release tooling warns about an optional Cupertino font not used
in application source, and release symbols require private handling. Neither
warning is hidden; physical-device/native release review remains required.

Final launch decision is **NOT READY FOR PRODUCTION** until the engineering and
external/business gates above have evidence. No later phase is started.
