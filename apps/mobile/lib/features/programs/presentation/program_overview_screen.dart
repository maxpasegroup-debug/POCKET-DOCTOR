import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/program_providers.dart';
import 'program_widgets.dart';

class ProgramOverviewScreen extends ConsumerWidget {
  const ProgramOverviewScreen({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context, WidgetRef ref) => DetailPage(
    title: 'My Program',
    onBack: () => context.canPop() ? context.pop() : context.go('/programs'),
    children: [
      ProgramAsync(
        value: ref.watch(programOverviewProvider(id)),
        onRetry: () => ref.invalidate(programOverviewProvider(id)),
        builder: (overview) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              overview.completed
                  ? 'A moment to recognise your effort.'
                  : 'One step at a time.',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 16),
            Text(
              overview.program.title,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 24),
            ProgramProgress(overview: overview),
            if (overview.completed)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Text(
                  'You have completed every required lesson. Return to any lesson whenever you need a refresher.',
                ),
              ),
            if (overview.currentLessonId != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: ActionButton(
                  label: overview.completed
                      ? 'Review lessons'
                      : 'Resume learning',
                  onPressed: () => context.push(
                    '/my-programs/$id/lessons/${overview.currentLessonId}',
                  ),
                ),
              ),
            if (overview.program.isLive)
              LiveSchedule(program: overview.program),
            for (final module in overview.program.modules) ...[
              PageSection(module.title),
              for (final lesson in module.lessons)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(lesson.title),
                  subtitle: Text(
                    overview.completedIds.contains(lesson.id)
                        ? 'Completed'
                        : '${lesson.durationSeconds} seconds',
                  ),
                  leading: Icon(
                    overview.completedIds.contains(lesson.id)
                        ? Icons.check_circle_outline
                        : Icons.play_circle_outline,
                  ),
                  onTap: () =>
                      context.push('/my-programs/$id/lessons/${lesson.id}'),
                ),
            ],
            const SizedBox(height: 24),
            const Text(educationNotice),
          ],
        ),
      ),
    ],
  );
}
