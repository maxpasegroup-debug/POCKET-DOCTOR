# Phase 1 file changes

No Git repository exists. This inventory compares source paths with the Phase 0
manifest and records the files edited during Phase 1. Generated platform files,
build outputs, dependency caches and local test credentials are ignored.

## Files created

- `apps/mobile/ios/Runner/Runner.entitlements`
- `apps/mobile/lib/core/networking/api_client.dart`
- `apps/mobile/lib/core/storage/session_store.dart`
- `apps/mobile/lib/features/auth/application/auth_controller.dart`
- `apps/mobile/lib/features/auth/data/api_session_repository.dart`
- `apps/mobile/lib/features/auth/domain/auth_models.dart`
- `apps/mobile/lib/features/auth/presentation/login_screen.dart`
- `apps/mobile/lib/features/auth/presentation/otp_screen.dart`
- `apps/mobile/lib/features/health/presentation/health_screen.dart`
- `apps/mobile/lib/features/notifications/presentation/notifications_screen.dart`
- `apps/mobile/lib/features/profile/domain/user_profile.dart`
- `apps/mobile/lib/features/profile/presentation/profile_setup_screen.dart`
- `apps/mobile/lib/features/settings/presentation/settings_screen.dart`
- `apps/mobile/lib/features/shop/presentation/shop_screen.dart`
- `apps/mobile/lib/shared/widgets/phase_one_widgets.dart`
- `apps/mobile/test/helpers/auth_fakes.dart`
- `apps/mobile/test/smoke/auth_journey_test.dart`
- `apps/mobile/test/unit/api_client_test.dart`
- `apps/mobile/test/unit/auth_test.dart`
- `docs/phase-1-validation.md`
- `docs/phase-1.md`
- `services/api/prisma/migrations/20260905010000_authentication_profile/migration.sql`
- `services/api/scripts/cleanup-auth.ts`
- `services/api/src/modules/auth/identity-service.ts`
- `services/api/src/modules/auth/profile.ts`
- `services/api/src/modules/auth/routes.ts`
- `services/api/test/auth.integration.test.ts`
- `docs/phase-1-files.md`

## Files modified

- `.env.example`
- `.github/workflows/ci.yml`
- `README.md`
- `apps/mobile/README.md`
- `apps/mobile/android/app/src/main/AndroidManifest.xml`
- `apps/mobile/ios/Runner.xcodeproj/project.pbxproj`
- `apps/mobile/lib/app.dart`
- `apps/mobile/lib/core/config/app_config.dart`
- `apps/mobile/lib/core/routing/app_router.dart`
- `apps/mobile/lib/core/routing/app_routes.dart`
- `apps/mobile/lib/core/storage/README.md`
- `apps/mobile/lib/features/assistant/presentation/assistant_screen.dart`
- `apps/mobile/lib/features/auth/domain/session_repository.dart`
- `apps/mobile/lib/features/auth/presentation/splash_screen.dart`
- `apps/mobile/lib/features/auth/presentation/welcome_screen.dart`
- `apps/mobile/lib/features/consultation/presentation/consultation_screen.dart`
- `apps/mobile/lib/features/health/README.md`
- `apps/mobile/lib/features/home/presentation/home_screen.dart`
- `apps/mobile/lib/features/profile/presentation/profile_screen.dart`
- `apps/mobile/lib/features/programs/presentation/programs_screen.dart`
- `apps/mobile/pubspec.lock`
- `apps/mobile/pubspec.yaml`
- `apps/mobile/test/widgets/navigation_test.dart`
- `apps/mobile/web/index.html`
- `docs/api.md`
- `docs/architecture.md`
- `docs/design-system.md`
- `docs/files.md`
- `docs/security.md`
- `services/api/Dockerfile`
- `services/api/package.json`
- `services/api/prisma/schema.prisma`
- `services/api/src/app.ts`
- `services/api/src/config/env.ts`
- `services/api/src/database/database.ts`
- `services/api/src/modules/auth/contracts.ts`
- `services/api/src/server.ts`
