# Phase 0 validation record

Validated locally on **2026-09-05**, Windows 11, Flutter 3.44.0 / Dart 3.12.0,
Node 24.11.1, Java 17 and Android SDK. The workspace was empty at the start.

| Check | Result |
| --- | --- |
| `dart format --output=none --set-exit-if-changed lib test` | Formatted source; no outstanding formatting changes |
| `flutter analyze` | Pass: no issues |
| `flutter test --dart-define=RUN_API_SMOKE=true` | Pass: **16 tests**, no skips |
| Flutter actual HTTP/Riverpod liveness probe | Pass against the running compiled API on localhost:3000 |
| Widget navigation | Splash → welcome → Home; all five tabs; unavailable route recovery |
| Responsive widget tests | All six content routes at 320×568, 390×844, 844×390, 1024×768; text scale 1× and 2× |
| `flutter build apk --debug` | Pass; final APK at `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk` |
| `flutter build web --debug` | Pass; `apps/mobile/build/web` |
| Browser smoke | Welcome action and all five navigation branches; mobile screenshots and wide/short viewport inspection |
| Backend `npm run build` / `npm run typecheck` | Pass |
| Backend `npm run db:validate` | Pass |
| Backend tests with configured PostgreSQL | Pass: **7 tests**, no skips |
| Compiled backend startup/liveness | Pass: real HTTP 200 from `/api/v1/health` |
| Configured database readiness | Pass: real HTTP 200 from `/api/v1/health/ready` |
| Unconfigured/unavailable readiness | Pass: 503 with generic public error |
| Prisma migration deploy | Pass on a dedicated disposable local PostgreSQL cluster |
| Prisma migrate diff | Pass: no difference between migrated database and checked-in schema |
| `npm run db:check` equivalent script | Pass using the real Prisma PostgreSQL adapter |
| `npm audit` | Pass: zero known vulnerabilities at validation time |
| Railway config | Matches the published Railway JSON schema |
| Source credential-pattern scan | No private-key, live provider-key, GitHub-token or AWS-key pattern matches |
| Environment files | Only `.env.example` is visible to the ignore-aware source scan; secret placeholders blank |

The default test command intentionally skips the live Flutter HTTP check and backend
database integration test if their prerequisites are not supplied. Both were explicitly
enabled for the final local verification above.

The database verification used portable PostgreSQL 18.4 tooling inside ignored
`artifacts/db-tooling`, bound to loopback port 55432 with a random temporary password.
No external database or Railway credentials were used. It applied the migration,
checked schema drift, ran tests and started a second API on port 3001 to probe readiness.
The Windows portable-tool shutdown stalled after successful assertions; its identified
test processes were cleaned up. This tooling is not an application dependency.
GitHub CI is configured to repeat database validation against PostgreSQL 17.

## Fixes discovered during validation

- Awaited core Fastify plugins before defining routes so route-specific rate limiting
  is actually applied; verified 429 behavior.
- Restricted the side navigation rail to adequately tall viewports to eliminate
  landscape overflow; tested the corrected layouts at large text scale.
- Updated vulnerable transitive Prisma tooling dependencies with documented overrides.
- Removed scaffold debug signing from the Android release configuration.

## Limits of this validation

- iOS platform files exist; iOS compilation, simulator/device behavior and signing require
  macOS/Xcode and were not run on this Windows host.
- Android APK compiled, but no Android emulator/device was connected for an installed
  native-app smoke test. Runtime navigation was exercised in Flutter widgets and Chrome.
- No approved logo exists. Plain text and default native/browser icon assets remain
  explicit placeholders; brand-asset approval is not implied.
- Railway/Docker deployment, cloud PostgreSQL TLS/backups, GitHub Actions execution,
  store identity and release signing have not been provisioned or validated live.
- The directory is not a Git repository and had no configured Git workflow. No commit,
  remote repository or deployment was created. Suggested future initial commit:
  `feat: establish Pocket Doctor phase 0 foundation`.
- Pattern scanning and dependency auditing are useful checks, not proof of security
  or regulatory compliance. There is no health-data launch in Phase 0.

Screenshots and temporary validation tooling are kept in ignored `artifacts/`.
Build outputs and generated clients are ignored. Source inventory is in [files.md](files.md).
