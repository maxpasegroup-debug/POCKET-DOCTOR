import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_doctor/features/auth/application/auth_controller.dart';
import 'package:pocket_doctor/features/auth/domain/auth_models.dart';
import 'package:pocket_doctor/features/auth/presentation/login_screen.dart';
import 'package:pocket_doctor/features/profile/presentation/profile_setup_screen.dart';
import '../helpers/auth_fakes.dart';

void main() {
  for (final profile in [false, true]) {
    testWidgets(
      '${profile ? 'Profile' : 'Login'} form remains scrollable above a keyboard on a small phone',
      (t) async {
        t.view.physicalSize = const Size(320, 568);
        t.view.devicePixelRatio = 1;
        t.view.viewInsets = const FakeViewPadding(bottom: 280);
        addTearDown(t.view.resetPhysicalSize);
        addTearDown(t.view.resetDevicePixelRatio);
        addTearDown(t.view.resetViewInsets);
        await t.pumpWidget(
          ProviderScope(
            overrides: [
              authProvider.overrideWith(
                () => ReadyAuthController(
                  AuthState(
                    phase: profile
                        ? AuthPhase.profileRequired
                        : AuthPhase.signedOut,
                    onboarded: true,
                    user: profile ? testUser : null,
                  ),
                ),
              ),
            ],
            child: MaterialApp(
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: TextScaler.linear(1.5)),
                child: child!,
              ),
              home: profile ? const ProfileSetupScreen() : const LoginScreen(),
            ),
          ),
        );
        await t.pumpAndSettle();
        final input = find.byKey(Key(profile ? 'name-input' : 'phone-input'));
        await t.ensureVisible(input);
        await t.enterText(input, profile ? 'Test Patient' : '9999900404');
        // Finish TextField's focus/keyboard scroll before the user scrolls down.
        await t.pumpAndSettle();
        final button = find.widgetWithText(
          FilledButton,
          profile ? 'Enter my health space' : 'Continue',
        );
        await t.ensureVisible(button);
        await t.pumpAndSettle();
        expect(button.hitTestable(), findsOneWidget);
        expect(t.getRect(button).bottom, lessThanOrEqualTo(288));
        expect(t.takeException(), isNull);
      },
    );
  }
}
