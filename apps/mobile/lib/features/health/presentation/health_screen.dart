import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/service_tile.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../../auth/application/auth_controller.dart';

class HealthScreen extends ConsumerWidget {
  const HealthScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    return DetailPage(
      title: 'My Health',
      children: [
        Text(
          'Your journey. Your pace.',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: 12),
        const Text(
          'Your health, your control. Make space for the habits that matter to you.',
        ),
        const SizedBox(height: 24),
        ServiceGrid(
          children: [
            ServiceTile(
              title: 'Manage wellness goals',
              icon: Icons.flag_outlined,
              color: AppColors.green,
              background: AppColors.mint,
              onTap: () => context.push('/assistant/goals'),
            ),
            ServiceTile(
              title: 'Daily check-in',
              icon: Icons.wb_sunny_outlined,
              color: AppColors.information,
              background: AppColors.sky,
              onTap: () => context.push('/assistant/check-ins'),
            ),
            ServiceTile(
              title: 'View My Programs',
              icon: Icons.auto_stories_outlined,
              color: AppColors.violet,
              background: AppColors.lavender,
              onTap: () => context.push('/my-programs'),
            ),
            ServiceTile(
              title: 'My reminders',
              icon: Icons.notifications_none_rounded,
              color: AppColors.green,
              background: AppColors.mint,
              onTap: () => context.push('/assistant/reminders'),
            ),
          ],
        ),
        const PageSection('Wellness interests'),
        if (user?.interests.isNotEmpty == true)
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final interest in user!.interests)
                Chip(label: Text(interest)),
            ],
          )
        else
          const Text('You haven’t selected interests yet.'),
        TextButton(
          onPressed: () => context.push('/profile/edit'),
          child: const Text('Manage interests'),
        ),
        const PageSection(
          'Health goals',
          subtitle: 'Choose a personal goal and update your own progress.',
        ),
        const PageSection(
          'Daily habits',
          subtitle:
              'Reflect with an optional check-in. Nothing is tracked automatically.',
        ),
        const PageSection(
          'Program activity',
          subtitle:
              'Your enrolled programs and saved learning progress are in My Programs.',
        ),
      ],
    );
  }
}
