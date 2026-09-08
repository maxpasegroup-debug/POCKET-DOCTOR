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
      detail: 'Explore doctor-led learning for your everyday wellbeing.',
    ),
    (
      title: 'Expert support.\nWhen you need it.',
      text:
          'A trusted place for learning and professional guidance as your needs change.',
      icon: Icons.people_outline,
      note: 'Talk to a Doctor',
      detail:
          'Explore partner profiles and check available consultation services.',
    ),
    (
      title: 'Better health.\nAn everyday habit.',
      text:
          'Small, consistent steps. A personal space that grows with your journey.',
      icon: Icons.spa_outlined,
      note: 'Support for your everyday',
      detail:
          'Explore curated wellness products, personal goals and reminders.',
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
            const Center(child: BrandLockup()),
            const SizedBox(height: 16),
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
            Center(
              child: Text(
                page.title,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
            ),
            const SizedBox(height: 20),
            Center(
              child: Text(
                page.text,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
            ),
            const SizedBox(height: 24),
            Center(
              child: Container(
                padding: const EdgeInsets.all(32),
                decoration: const BoxDecoration(
                  color: AppColors.mint,
                  shape: BoxShape.circle,
                ),
                child: Icon(page.icon, size: 72, color: AppColors.green),
              ),
            ),
            const SizedBox(height: 20),
            Center(
              child: Wrap(
                alignment: WrapAlignment.center,
                spacing: 8,
                runSpacing: 8,
                children: const [
                  Chip(
                    avatar: Icon(Icons.favorite_border, size: 18),
                    label: Text('Physical health'),
                  ),
                  Chip(
                    avatar: Icon(Icons.self_improvement, size: 18),
                    label: Text('Mental wellbeing'),
                  ),
                  Chip(
                    avatar: Icon(Icons.spa_outlined, size: 18),
                    label: Text('Wellness'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
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
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < _pages.length; i++)
                  Container(
                    width: i == _index ? 22 : 7,
                    height: 7,
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    decoration: BoxDecoration(
                      color: i == _index ? AppColors.green : AppColors.border,
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 24),
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
