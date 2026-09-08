import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/auth_controller.dart';
import '../domain/auth_models.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _phone = TextEditingController();
  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  void _submit() {
    if (_form.currentState!.validate()) {
      ref
          .read(authProvider.notifier)
          .requestOtp(PhoneNumber.india(_phone.text));
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    return AuthPage(
      title: 'Your personal health space.',
      description: 'Sign in or get started with your mobile number.',
      children: [
        Form(
          key: _form,
          child: TextFormField(
            key: const Key('phone-input'),
            controller: _phone,
            enabled: !auth.busy,
            keyboardType: TextInputType.phone,
            autofillHints: const [AutofillHints.telephoneNumberNational],
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(10),
            ],
            decoration: const InputDecoration(
              labelText: 'Mobile number',
              prefixText: '+91  ',
              helperText: 'India · 10-digit mobile number',
              border: OutlineInputBorder(),
            ),
            validator: PhoneNumber.validate,
            onFieldSubmitted: (_) => _submit(),
          ),
        ),
        if (auth.error != null) ErrorNotice(message: auth.error!),
        const SizedBox(height: 24),
        ActionButton(label: 'Continue', busy: auth.busy, onPressed: _submit),
        const SizedBox(height: 20),
        const Text(
          'We’ll verify your number with a one-time code. Your number stays private.',
        ),
      ],
    );
  }
}
