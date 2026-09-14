import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/program_providers.dart';
import 'program_widgets.dart';

class HomePrograms extends ConsumerWidget {
  const HomePrograms({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const PageSection('Continue learning'),
      ProgramAsync(
        value: ref.watch(myProgramsProvider),
        onRetry: () => ref.invalidate(myProgramsProvider),
        builder: (items) {
          final active = items.where((item) => !item.completed).toList();
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (active.isEmpty)
                const Text(
                  'Your next chapter starts with a program. Explore topics at your own pace.',
                )
              else
                ProgramCard(
                  program: active.first.program,
                  overview: active.first,
                ),
              TextButton(
                onPressed: () => context.push('/my-programs'),
                child: const Text('View My Programs'),
              ),
            ],
          );
        },
      ),
      const PageSection('Recommended for your interests'),
      ProgramAsync(
        value: ref.watch(recommendedProgramsProvider),
        onRetry: () => ref.invalidate(recommendedProgramsProvider),
        builder: (items) => items.isEmpty
            ? const Text(
                'No matching programs yet. You can explore all topics in Learn & Transform.',
              )
            : ProgramCard(program: items.first),
      ),
      const PageSection('Discover a learning journey'),
      ProgramAsync(
        value: ref.watch(homeProgramsProvider),
        onRetry: () => ref.invalidate(homeProgramsProvider),
        builder: (items) {
          final recorded = items.where((p) => !p.isLive);
          final featured =
              recorded.where((p) => p.featured).firstOrNull ??
              recorded.firstOrNull;
          final live = items.where((p) => p.isLive).firstOrNull;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (items.isEmpty) const Text('No programs available yet.'),
              if (featured != null) ProgramCard(program: featured),
              if (live != null) ...[
                const PageSection('Live learning'),
                ProgramCard(program: live),
              ],
            ],
          );
        },
      ),
    ],
  );
}
