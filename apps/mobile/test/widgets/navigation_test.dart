import '../helpers/membership_fakes.dart';
import 'package:pocket_doctor/features/membership/application/membership_providers.dart';
import '../helpers/assistant_fakes.dart';
import 'package:pocket_doctor/features/assistant/application/assistant_providers.dart';
import '../helpers/commerce_fakes.dart';
import 'package:pocket_doctor/features/wellness/application/commerce_providers.dart';
import '../helpers/consultation_fakes.dart';
import 'package:pocket_doctor/features/consultation/application/consultation_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_doctor/app.dart';
import 'package:pocket_doctor/core/routing/app_router.dart';
import 'package:pocket_doctor/core/storage/session_store.dart';
import 'package:pocket_doctor/features/auth/application/auth_controller.dart';
import 'package:pocket_doctor/features/auth/data/api_session_repository.dart';
import 'package:pocket_doctor/features/auth/domain/auth_models.dart';
import '../helpers/auth_fakes.dart';
import '../helpers/program_fakes.dart';
import 'package:pocket_doctor/features/programs/application/program_providers.dart';

void main() {
  testWidgets('assistant doctor action switches existing shell tabs safely', (
    tester,
  ) async {
    final assistant = FakeAssistantRepository();
    final container = ProviderContainer(
      overrides: [
        membershipRepositoryProvider.overrideWithValue(
          FakeMembershipRepository(),
        ),
        assistantRepositoryProvider.overrideWithValue(assistant),
        commerceRepositoryProvider.overrideWithValue(
          FakeCommerceRepository(empty: true),
        ),
        consultationRepositoryProvider.overrideWithValue(
          FakeConsultationRepository(empty: true),
        ),
        programRepositoryProvider.overrideWithValue(
          FakeProgramRepository(empty: true),
        ),
        authProvider.overrideWith(
          () => ReadyAuthController(
            const AuthState(
              phase: AuthPhase.signedIn,
              user: testUser,
              onboarded: true,
            ),
          ),
        ),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const PocketDoctorApp(),
      ),
    );
    await tester.pumpAndSettle();
    container.read(appRouterProvider).go('/assistant');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Start a conversation'));
    await tester.tap(find.text('Start a conversation'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Can you diagnose me?');
    await tester.ensureVisible(find.text('Send message'));
    await tester.tap(find.text('Send message'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Talk to a Doctor'));
    await tester.tap(find.text('Talk to a Doctor'));
    await tester.pumpAndSettle();
    expect(find.text('Care begins with a conversation.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'splash → onboarding → phone → OTP → profile → tabs → logout → login',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final repository = FakeSessionRepository();
      final store = MemorySessionStore();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            membershipRepositoryProvider.overrideWithValue(
              FakeMembershipRepository(),
            ),
            assistantRepositoryProvider.overrideWithValue(
              FakeAssistantRepository(),
            ),
            commerceRepositoryProvider.overrideWithValue(
              FakeCommerceRepository(empty: true),
            ),
            consultationRepositoryProvider.overrideWithValue(
              FakeConsultationRepository(empty: true),
            ),
            programRepositoryProvider.overrideWithValue(
              FakeProgramRepository(empty: true),
            ),
            sessionStoreProvider.overrideWithValue(store),
            sessionRepositoryProvider.overrideWithValue(repository),
          ],
          child: const PocketDoctorApp(),
        ),
      );
      expect(find.text('POCKET DOCTOR'), findsOneWidget);
      await tester.pumpAndSettle();
      expect(find.text('Understand\nyour health.'), findsOneWidget);
      for (var i = 0; i < 3; i++) {
        await tester.ensureVisible(find.byKey(const Key('welcome-continue')));
        await tester.tap(find.byKey(const Key('welcome-continue')));
        await tester.pumpAndSettle();
      }
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(
        find.text('Enter a valid 10-digit Indian mobile number.'),
        findsOneWidget,
      );
      await tester.enterText(
        find.byKey(const Key('phone-input')),
        '9876543210',
      );
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('otp-input')), findsOneWidget);
      await tester.enterText(find.byKey(const Key('otp-input')), '123456');
      await tester.tap(find.text('Verify & continue'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('name-input')), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('name-input')),
        'Test Person',
      );
      await tester.ensureVisible(find.text('Enter my health space'));
      await tester.tap(find.text('Enter my health space'));
      await tester.pumpAndSettle();
      expect(find.text('Your health journey\nstarts here.'), findsOneWidget);
      for (final key in [
        'service-programs',
        'service-consult',
        'service-shop',
        'service-assistant',
      ]) {
        expect(find.byKey(Key(key)), findsOneWidget);
      }
      for (final entry in {
        'Programs': 'Knowledge for a healthier life.',
        'Consult': 'Care begins with a conversation.',
        'Assistant': 'Your personal health companion.',
        'Profile': 'Health, on your terms.',
        'Home': 'Your health journey\nstarts here.',
      }.entries) {
        await tester.tap(
          find.descendant(
            of: find.byType(NavigationBar),
            matching: find.text(entry.key),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text(entry.value), findsOneWidget);
        expect(tester.takeException(), isNull);
      }
      await tester.ensureVisible(find.byKey(const Key('service-shop')));
      await tester.tap(find.byKey(const Key('service-shop')));
      await tester.pumpAndSettle();
      expect(find.text('A little care,\nevery day.'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text('Profile'),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Settings'));
      await tester.tap(find.text('Settings'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Sign out'));
      await tester.tap(find.text('Sign out'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Sign out'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('phone-input')), findsOneWidget);
      expect(store.token, isNull);
      await tester.enterText(
        find.byKey(const Key('phone-input')),
        '9876543210',
      );
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('otp-input')), '123456');
      await tester.tap(find.text('Verify & continue'));
      await tester.pumpAndSettle();
      expect(find.text('Your health journey\nstarts here.'), findsOneWidget);
    },
  );

  for (final size in [
    const Size(320, 568),
    const Size(390, 844),
    const Size(844, 390),
    const Size(1024, 768),
  ]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('all screen layouts fit $size at $scale text scale', (
        tester,
      ) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final controller = ReadyAuthController(
          const AuthState(
            phase: AuthPhase.signedIn,
            user: testUser,
            onboarded: true,
          ),
        );
        final container = ProviderContainer(
          overrides: [
            membershipRepositoryProvider.overrideWithValue(
              FakeMembershipRepository(),
            ),
            assistantRepositoryProvider.overrideWithValue(
              FakeAssistantRepository(),
            ),
            commerceRepositoryProvider.overrideWithValue(
              FakeCommerceRepository(empty: true),
            ),
            consultationRepositoryProvider.overrideWithValue(
              FakeConsultationRepository(empty: true),
            ),
            authProvider.overrideWith(() => controller),
            programRepositoryProvider.overrideWithValue(
              FakeProgramRepository(empty: true),
            ),
          ],
        );
        addTearDown(container.dispose);
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: MediaQuery(
              data: MediaQueryData(
                size: size,
                textScaler: TextScaler.linear(scale),
              ),
              child: const PocketDoctorApp(),
            ),
          ),
        );
        final router = container.read(appRouterProvider);
        for (final path in [
          '/home',
          '/programs',
          '/consultation',
          '/assistant',
          '/assistant/history',
          '/assistant/chat/conversation',
          '/assistant/memory',
          '/assistant/goals',
          '/assistant/check-ins',
          '/assistant/reminders',
          '/assistant/settings',
          '/assistant/whatsapp',
          '/profile',
          '/profile/edit',
          '/shop',
          '/products/product',
          '/cart',
          '/addresses',
          '/checkout',
          '/orders',
          '/orders/order',
          '/health',
          '/settings',
          '/notifications',
          '/settings/privacy',
        ]) {
          router.go(path);
          await tester.pumpAndSettle();
          expect(
            tester.takeException(),
            isNull,
            reason: '$path at $size / $scale',
          );
        }
        for (final entry in {
          '/welcome': const AuthState(phase: AuthPhase.signedOut),
          '/login': const AuthState(
            phase: AuthPhase.signedOut,
            onboarded: true,
          ),
          '/otp': AuthState(
            phase: AuthPhase.otp,
            onboarded: true,
            challenge: OtpChallenge(
              id: 'test',
              phone: testUser.phone,
              resendAt: DateTime.now(),
              expiresAt: DateTime.now().add(const Duration(minutes: 5)),
            ),
          ),
          '/profile/setup': const AuthState(
            phase: AuthPhase.profileRequired,
            onboarded: true,
            user: testUser,
          ),
        }.entries) {
          controller.seed(entry.value);
          router.go(entry.key);
          await tester.pumpAndSettle();
          expect(
            tester.takeException(),
            isNull,
            reason: '${entry.key} at $size / $scale',
          );
        }
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }
  testWidgets('protected deep links redirect and unknown routes recover', (
    tester,
  ) async {
    final controller = ReadyAuthController(
      const AuthState(phase: AuthPhase.signedOut, onboarded: true),
    );
    final container = ProviderContainer(
      overrides: [
        membershipRepositoryProvider.overrideWithValue(
          FakeMembershipRepository(),
        ),
        assistantRepositoryProvider.overrideWithValue(
          FakeAssistantRepository(),
        ),
        commerceRepositoryProvider.overrideWithValue(
          FakeCommerceRepository(empty: true),
        ),
        consultationRepositoryProvider.overrideWithValue(
          FakeConsultationRepository(empty: true),
        ),
        authProvider.overrideWith(() => controller),
        programRepositoryProvider.overrideWithValue(
          FakeProgramRepository(empty: true),
        ),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const PocketDoctorApp(),
      ),
    );
    await tester.pumpAndSettle();
    final router = container.read(appRouterProvider);
    router.go('/profile');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('phone-input')), findsOneWidget);
    controller.seed(
      const AuthState(
        phase: AuthPhase.signedIn,
        user: testUser,
        onboarded: true,
      ),
    );
    router.go('/not-yet');
    await tester.pumpAndSettle();
    expect(find.text('This page is not available yet.'), findsOneWidget);
    await tester.tap(find.text('Go to Home'));
    await tester.pumpAndSettle();
    expect(find.text('Your health journey\nstarts here.'), findsOneWidget);
  });
}
