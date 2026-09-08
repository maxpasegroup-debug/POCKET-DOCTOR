import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
          'A personal space for everyday wellness. No medical scores, diagnoses or clinical interpretations.',
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
        OutlinedButton(
          onPressed: () => context.push('/assistant/goals'),
          child: const Text('Manage wellness goals'),
        ),
        const PageSection(
          'Daily habits',
          subtitle:
              'Reflect with an optional check-in. Nothing is tracked automatically.',
        ),
        OutlinedButton(
          onPressed: () => context.push('/assistant/check-ins'),
          child: const Text('Daily check-in'),
        ),
        const PageSection(
          'Program activity',
          subtitle:
              'Your enrolled programs and saved learning progress are in My Programs.',
        ),
        OutlinedButton(
          onPressed: () => context.push('/my-programs'),
          child: const Text('View My Programs'),
        ),
      ],
    );
  }
}
