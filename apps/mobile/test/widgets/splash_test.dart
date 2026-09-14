import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_doctor/app.dart';
import 'package:pocket_doctor/core/storage/session_store.dart';
import 'package:pocket_doctor/features/auth/application/auth_controller.dart';
import 'package:pocket_doctor/features/auth/data/api_session_repository.dart';
import 'package:pocket_doctor/features/auth/domain/auth_models.dart';
import 'package:pocket_doctor/features/auth/presentation/splash_screen.dart';
import '../helpers/auth_fakes.dart';

class RetryAuthController extends ReadyAuthController {
  RetryAuthController()
    : super(const AuthState(error: 'Could not connect. Please try again.'));
  int retries = 0;

  @override
  Future<void> initialize() async {
    retries++;
    seed(const AuthState(phase: AuthPhase.signedOut, onboarded: true));
  }
}

void main() {
  testWidgets(
    'fast session check keeps branding visible for two seconds without a spinner',
    (tester) async {
      final store = MemorySessionStore()..onboarded = true;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            sessionStoreProvider.overrideWithValue(store),
            sessionRepositoryProvider.overrideWithValue(
              FakeSessionRepository(),
            ),
          ],
          child: const PocketDoctorApp(),
        ),
      );
      await tester.pump(const Duration(milliseconds: 1999));
      expect(find.byType(SplashScreen), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.byKey(const Key('phone-input')), findsNothing);
      await tester.pump(const Duration(milliseconds: 1));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('phone-input')), findsOneWidget);
      expect(find.byType(SplashScreen), findsNothing);

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(find.byType(SplashScreen), findsNothing);
    },
  );

  testWidgets(
    'slow initialization keeps splash until auth resolves without another delay',
    (tester) async {
      final auth = ReadyAuthController(const AuthState());
      await tester.pumpWidget(
        ProviderScope(
          overrides: [authProvider.overrideWith(() => auth)],
          child: const PocketDoctorApp(),
        ),
      );
      await tester.pump(const Duration(seconds: 3));
      await tester.pumpAndSettle();
      expect(find.byType(SplashScreen), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      auth.seed(const AuthState(phase: AuthPhase.signedOut, onboarded: true));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('phone-input')), findsOneWidget);
    },
  );

  testWidgets(
    'startup errors retain a working retry action during the display period',
    (tester) async {
      final auth = RetryAuthController();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [authProvider.overrideWith(() => auth)],
          child: const PocketDoctorApp(),
        ),
      );
      expect(find.text('Could not connect. Please try again.'), findsOneWidget);
      await tester.tap(find.text('Try again'));
      await tester.pump();
      expect(auth.retries, 1);
      expect(find.byType(SplashScreen), findsOneWidget);
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('phone-input')), findsOneWidget);
    },
  );

  testWidgets('disposing the app during splash cancels its timer', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(
            () => ReadyAuthController(const AuthState()),
          ),
        ],
        child: const PocketDoctorApp(),
      ),
    );
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 3));
    expect(tester.takeException(), isNull);
  });
}
