import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/brand_lockup.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/auth_controller.dart';

class WelcomeScreen extends ConsumerStatefulWidget {
  const WelcomeScreen({super.key});
  @override
  ConsumerState<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends ConsumerState<WelcomeScreen> {
  int _index = 0;
  static const _pages = [
    (
      title: 'Understand\nyour health.',
      text:
          'Make room for your physical health, mental wellbeing and everyday wellness.',
      icon: Icons.auto_stories_outlined,
      note: 'Learn & Transform',
      detail: 'Doctor-led recorded and live programs are coming soon.',
    ),
    (
      title: 'Expert support.\nWhen you need it.',
      text:
          'A trusted place for learning and professional guidance as your needs change.',
      icon: Icons.people_outline,
      note: 'Talk to a Doctor',
      detail:
          'Connect with verified Pocket Doctor partner doctors in a future release.',
    ),
    (
      title: 'Better health.\nAn everyday habit.',
      text:
          'Small, consistent steps. A personal space that grows with your journey.',
      icon: Icons.spa_outlined,
      note: 'Support for your everyday',
      detail:
          'Curated wellness medicines and an AI health companion are on the way.',
    ),
  ];
  @override
  Widget build(BuildContext context) {
    final page = _pages[_index];
    final auth = ref.watch(authProvider);
    return Scaffold(
      body: SafeArea(
        child: PageBody(
          children: [
            const BrandLockup(showTagline: true),
            const SizedBox(height: 32),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Semantics(
                    label: 'Introduction ${_index + 1} of 3',
                    child: Text('0${_index + 1} / 03'),
                  ),
                ),
                TextButton(
                  onPressed: auth.busy
                      ? null
                      : ref.read(authProvider.notifier).finishOnboarding,
                  child: const Text('Skip'),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Icon(page.icon, size: 64, color: AppColors.green),
            const SizedBox(height: 32),
            Text(page.title, style: Theme.of(context).textTheme.displaySmall),
            const SizedBox(height: 20),
            Text(page.text, style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: 32),
            FoundationCard(
              color: AppColors.mint,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    page.note,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 12),
                  Text(page.detail),
                ],
              ),
            ),
            if (auth.error != null) ErrorNotice(message: auth.error!),
            const SizedBox(height: 32),
            ActionButton(
              key: const Key('welcome-continue'),
              label: _index == 2 ? 'Get started' : 'Next',
              busy: auth.busy,
              onPressed: () {
                if (_index < 2) {
                  setState(() => _index++);
                } else {
                  ref.read(authProvider.notifier).finishOnboarding();
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}
