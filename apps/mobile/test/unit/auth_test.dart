import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_doctor/core/networking/api_client.dart';
import 'package:pocket_doctor/core/routing/app_router.dart';
import 'package:pocket_doctor/core/storage/session_store.dart';
import 'package:pocket_doctor/features/auth/application/auth_controller.dart';
import 'package:pocket_doctor/features/auth/data/api_session_repository.dart';
import 'package:pocket_doctor/features/auth/domain/auth_models.dart';
import 'package:pocket_doctor/features/profile/domain/user_profile.dart';
import '../helpers/auth_fakes.dart';

void main() {
  test('India phone normalization and input validation', () {
    expect(PhoneNumber.validate('9876543210'), isNull);
    for (final phone in ['', '123', '1234567890', '98765432100']) {
      expect(PhoneNumber.validate(phone), isNotNull);
    }
    expect(PhoneNumber.india('98765 43210'), '+919876543210');
    expect(ProfileDraft.validateName('  '), isNotNull);
    expect(ProfileDraft.validateName('Test Person'), isNull);
  });
  test(
    'route guards cover initialization, new user, OTP, profile and authenticated states',
    () {
      for (final route in [
        '/home',
        '/programs',
        '/consult',
        '/assistant',
        '/health',
        '/profile',
        '/settings',
        '/notifications',
        '/shop',
        '/doctors/1',
      ]) {
        expect(authRedirect(const AuthState(), route), '/splash');
        expect(
          authRedirect(const AuthState(phase: AuthPhase.signedOut), route),
          '/welcome',
        );
        expect(
          authRedirect(
            const AuthState(phase: AuthPhase.signedOut, onboarded: true),
            route,
          ),
          '/login',
        );
        expect(
          authRedirect(const AuthState(phase: AuthPhase.otp), route),
          '/otp',
        );
        expect(
          authRedirect(
            const AuthState(phase: AuthPhase.profileRequired),
            route,
          ),
          '/profile/setup',
        );
        expect(
          authRedirect(const AuthState(phase: AuthPhase.signedIn), route),
          isNull,
        );
      }
      expect(
        authRedirect(const AuthState(phase: AuthPhase.signedIn), '/login'),
        '/home',
      );
    },
  );

  late MemorySessionStore store;
  late FakeSessionRepository repository;
  late ProviderContainer container;
  setUp(() {
    store = MemorySessionStore();
    repository = FakeSessionRepository();
    container = ProviderContainer(
      overrides: [
        sessionStoreProvider.overrideWithValue(store),
        sessionRepositoryProvider.overrideWithValue(repository),
      ],
    );
  });
  tearDown(() => container.dispose());
  Future<AuthController> start() async {
    final controller = container.read(authProvider.notifier);
    await Future<void>.delayed(Duration.zero);
    return controller;
  }

  test('onboarding → OTP → profile → signed in → logout → restore', () async {
    final controller = await start();
    expect(container.read(authProvider).phase, AuthPhase.signedOut);
    await controller.finishOnboarding();
    expect(store.onboarded, true);
    await controller.requestOtp('+919876543210');
    expect(container.read(authProvider).phase, AuthPhase.otp);
    await controller.verifyOtp('bad');
    expect(container.read(authProvider).error, isNotNull);
    await controller.verifyOtp('123456');
    expect(container.read(authProvider).phase, AuthPhase.profileRequired);
    expect(store.token, 'test-token');
    await controller.saveProfile(
      const ProfileDraft(
        fullName: 'Test Person',
        language: 'en',
        interests: ['Sleep'],
        notifications: false,
      ),
    );
    expect(container.read(authProvider).phase, AuthPhase.signedIn);
    expect(container.read(currentUserProvider)?.interests, ['Sleep']);
    await controller.logout();
    expect(repository.revoked, true);
    expect(store.token, isNull);
    expect(container.read(currentUserProvider), isNull);
    await controller.requestOtp('+919876543210');
    await controller.verifyOtp('123456');
    expect(container.read(authProvider).phase, AuthPhase.signedIn);
    await controller.initialize();
    expect(container.read(currentUserProvider)?.fullName, 'Test Person');
  });
  test(
    'OTP error remains retryable and change number clears challenge',
    () async {
      final controller = await start();
      repository.failure = const ApiFailure('Try later', status: 429);
      await controller.requestOtp('+919876543210');
      expect(container.read(authProvider).busy, false);
      expect(container.read(authProvider).error, 'Try later');
      repository.failure = null;
      await controller.requestOtp('+919876543210');
      await controller.verifyOtp('999999');
      expect(container.read(authProvider).phase, AuthPhase.otp);
      controller.changeNumber();
      expect(container.read(authProvider).challenge, isNull);
    },
  );
  test('profile save failure preserves identity and permits retry', () async {
    store.token = 'test-token';
    repository.user = testUser;
    final controller = await start();
    repository.failure = const ApiFailure('Try again', status: 503);
    const draft = ProfileDraft(
      fullName: 'Changed Name',
      language: 'hi',
      interests: [],
      notifications: false,
    );
    expect(await controller.saveProfile(draft), false);
    expect(container.read(currentUserProvider)?.fullName, 'Test Person');
    repository.failure = null;
    expect(await controller.saveProfile(draft), true);
    expect(container.read(currentUserProvider)?.fullName, 'Changed Name');
  });
  test(
    'network failure during restore keeps stored credential for retry',
    () async {
      store.token = 'test-token';
      repository.user = testUser;
      repository.failure = const ApiFailure('No connection');
      final controller = await start();
      expect(container.read(authProvider).phase, AuthPhase.initializing);
      expect(container.read(authProvider).error, isNotNull);
      expect(store.token, 'test-token');
      repository.failure = null;
      await controller.initialize();
      expect(container.read(authProvider).phase, AuthPhase.signedIn);
    },
  );
  test('unauthorized callback clears profile and token', () async {
    store.token = 'test-token';
    repository.user = testUser;
    await start();
    container.read(apiClientProvider).onUnauthorized!();
    await Future<void>.delayed(Duration.zero);
    expect(store.token, isNull);
    expect(container.read(currentUserProvider), isNull);
    expect(container.read(authProvider).phase, AuthPhase.signedOut);
  });
  test(
    'offline logout still clears device session and explains revocation limit',
    () async {
      store.token = 'test-token';
      repository.user = testUser;
      final controller = await start();
      repository.failure = const ApiFailure('Offline');
      await controller.logout();
      expect(store.token, isNull);
      expect(container.read(currentUserProvider), isNull);
      expect(container.read(authProvider).error, contains('could not revoke'));
    },
  );
}
