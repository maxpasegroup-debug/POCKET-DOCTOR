import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_doctor/core/config/app_config.dart';
import 'package:pocket_doctor/core/networking/api_client.dart';
import 'package:pocket_doctor/core/storage/session_store.dart';
import 'package:pocket_doctor/features/auth/application/auth_controller.dart';
import 'package:pocket_doctor/features/auth/domain/auth_models.dart';
import 'package:pocket_doctor/features/profile/domain/user_profile.dart';
import '../helpers/auth_fakes.dart';

void main() {
  const enabled = bool.fromEnvironment('RUN_AUTH_SMOKE');
  test(
    'real Flutter repository → OTP API → PostgreSQL profile → restore → revoke',
    () async {
      final config = AppConfig.fromEnvironment();
      expect(config.environment, AppEnvironment.development);
      expect(
        ['localhost', '127.0.0.1'].contains(config.apiBaseUri.host),
        true,
        reason: 'Use an isolated local development API only.',
      );
      final store = MemorySessionStore();
      final container = ProviderContainer(
        overrides: [sessionStoreProvider.overrideWithValue(store)],
      );
      addTearDown(container.dispose);
      final controller = container.read(authProvider.notifier);
      await Future<void>.delayed(Duration.zero);
      await controller.finishOnboarding();
      final phone =
          '+919${Random.secure().nextInt(1000000000).toString().padLeft(9, '0')}';
      await controller.requestOtp(phone);
      final challenge = container.read(authProvider).challenge;
      expect(challenge, isNotNull, reason: container.read(authProvider).error);
      expect(
        challenge!.developmentCode,
        isNotNull,
        reason: 'Explicit development OTP mode is required.',
      );
      await controller.verifyOtp(challenge.developmentCode!);
      expect(container.read(authProvider).phase, AuthPhase.profileRequired);
      expect(
        await controller.saveProfile(
          const ProfileDraft(
            fullName: 'Local Validation',
            language: 'en',
            interests: ['Sleep'],
            notifications: false,
          ),
        ),
        true,
      );
      expect(container.read(authProvider).phase, AuthPhase.signedIn);
      final client = container.read(apiClientProvider);
      final token = client.token!;
      final data = await client.request(
        'GET',
        '/users/me',
        authenticated: true,
      );
      expect(data['user']['fullName'], 'Local Validation');
      await controller.initialize();
      expect(container.read(currentUserProvider)?.interests, ['Sleep']);
      await controller.logout();
      expect(store.token, isNull);
      expect(container.read(currentUserProvider), isNull);
      client.token = token;
      await expectLater(
        client.request('GET', '/auth/session', authenticated: true),
        throwsA(
          isA<ApiFailure>().having((error) => error.status, 'status', 401),
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(container.read(authProvider).phase, AuthPhase.signedOut);
    },
    skip: !enabled,
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
