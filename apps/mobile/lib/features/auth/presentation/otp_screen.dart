import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/config/app_config.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/auth_controller.dart';

class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key});
  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _code = TextEditingController();
  Timer? _timer;
  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final challenge = auth.challenge;
    if (challenge == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final config = ref.watch(appConfigProvider);
    final remaining = max(
      0,
      challenge.resendAt.difference(DateTime.now()).inSeconds + 1,
    );
    final expired = DateTime.now().isAfter(challenge.expiresAt);
    final controller = ref.read(authProvider.notifier);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop && !auth.busy) {
          controller.changeNumber();
        }
      },
      child: AuthPage(
        title: 'A quick check. Then you’re in.',
        description: 'Enter the six-digit code for ${challenge.phone}.',
        onBack: auth.busy ? null : controller.changeNumber,
        children: [
          TextField(
            key: const Key('otp-input'),
            controller: _code,
            enabled: !auth.busy,
            keyboardType: TextInputType.number,
            autofillHints: const [AutofillHints.oneTimeCode],
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(6),
            ],
            style: const TextStyle(fontSize: 28, letterSpacing: 8),
            decoration: const InputDecoration(
              labelText: 'Verification code',
              border: OutlineInputBorder(),
            ),
            onSubmitted: (_) => controller.verifyOtp(_code.text),
          ),
          if (config.environment == AppEnvironment.development &&
              config.showDevelopmentOtp &&
              challenge.developmentCode != null) ...[
            const SizedBox(height: 16),
            SelectableText(
              'Development preview · No SMS sent\nCode: ${challenge.developmentCode}',
              key: const Key('development-code'),
            ),
          ],
          if (auth.error != null) ErrorNotice(message: auth.error!),
          if (expired)
            const ErrorNotice(
              message: 'This code has expired. Request a new one below.',
            ),
          const SizedBox(height: 24),
          ActionButton(
            label: 'Verify & continue',
            busy: auth.busy,
            onPressed: expired ? null : () => controller.verifyOtp(_code.text),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: remaining > 0 || auth.busy
                ? null
                : () {
                    _code.clear();
                    controller.requestOtp(challenge.phone);
                  },
            child: Text(
              remaining > 0 ? 'Resend code in ${remaining}s' : 'Resend code',
            ),
          ),
          TextButton(
            onPressed: auth.busy ? null : controller.changeNumber,
            child: const Text('Use a different number'),
          ),
        ],
      ),
    );
  }
}
