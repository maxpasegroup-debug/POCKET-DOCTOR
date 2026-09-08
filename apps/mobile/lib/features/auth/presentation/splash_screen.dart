import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/widgets/brand_lockup.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/auth_controller.dart';

class SplashScreen extends ConsumerWidget {
  const SplashScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const BrandLockup(showTagline: true),
                  const SizedBox(height: 32),
                  if (auth.error != null)
                    ErrorNotice(
                      message: auth.error!,
                      onRetry: ref.read(authProvider.notifier).initialize,
                    )
                  else
                    Semantics(
                      label: 'Opening your health space',
                      child: CircularProgressIndicator(),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
