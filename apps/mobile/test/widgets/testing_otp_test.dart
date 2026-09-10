import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_doctor/core/config/app_config.dart';
import 'package:pocket_doctor/features/auth/application/auth_controller.dart';
import 'package:pocket_doctor/features/auth/domain/auth_models.dart';
import 'package:pocket_doctor/features/auth/presentation/otp_screen.dart';
import '../helpers/auth_fakes.dart';

void main() {
  for (final environment in AppEnvironment.values) {
    for (final enabled in [true, false]) {
      testWidgets('OTP preview in $environment with opt-in $enabled', (
        tester,
      ) async {
        final challenge = OtpChallenge.fromJson({
          'challengeId': 'test-challenge',
          'resendAfterSeconds': 60,
          'expiresInSeconds': 300,
          'developmentCode': '654321',
          'delivery': 'testing',
        }, '+919000000000');
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              appConfigProvider.overrideWithValue(
                AppConfig(
                  environment: environment,
                  apiBaseUrl: 'https://test.example/api/v1',
                  showDevelopmentOtp: enabled,
                ),
              ),
              authProvider.overrideWith(
                () => ReadyAuthController(
                  AuthState(phase: AuthPhase.otp, challenge: challenge),
                ),
              ),
            ],
            child: const MaterialApp(home: OtpScreen()),
          ),
        );
        await tester.pumpAndSettle();
        final visible = enabled && environment != AppEnvironment.production;
        expect(
          find.byKey(const Key('development-code')),
          visible ? findsOneWidget : findsNothing,
        );
        expect(
          find.textContaining('654321'),
          visible ? findsOneWidget : findsNothing,
        );
        expect(find.byKey(const Key('otp-input')), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }
}
