import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/program_providers.dart';
import '../domain/program_models.dart';
import 'program_widgets.dart';

class ProgramDetailScreen extends ConsumerWidget {
  const ProgramDetailScreen({super.key, required this.id});
  final String id;
  Future<void> join(
    BuildContext context,
    WidgetRef ref,
    Program program,
  ) async {
    final actions = ref.read(programActionsProvider.notifier);
    if (program.membershipRequired) {
      context.push('/membership');
      return;
    }
    if (program.enrolled) {
      context.push('/my-programs/$id');
      return;
    }
    if (program.pricePaise == 0 || program.memberAccess) {
      if (await actions.enroll(id) && context.mounted) {
        context.push('/my-programs/$id');
      }
      return;
    }
    final payment = await actions.payment(id);
    if (payment == null || !context.mounted) return;
    final capture = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Development payment'),
        content: Text(
          'DEMO ONLY · No money is charged.\n\nSimulate payment of ₹${(payment.amountPaise / 100).toStringAsFixed(2)} for this demo program.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Simulate failure'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Simulate payment'),
          ),
        ],
      ),
    );
    if (capture == null || !context.mounted) return;
    if (await actions.settle(id, payment.id, capture) && context.mounted) {
      context.push('/my-programs/$id');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final action = ref.watch(programActionsProvider);
    return DetailPage(
      title: 'Your learning journey',
      onBack: () => context.canPop() ? context.pop() : context.go('/programs'),
      children: [
        ProgramAsync(
          value: ref.watch(programDetailProvider(id)),
          onRetry: () => ref.invalidate(programDetailProvider(id)),
          builder: (program) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ProgramCover(program: program),
              const SizedBox(height: 24),
              Text(
                '${program.category.name} · ${program.isLive ? 'Live' : 'Recorded'} · ${program.level}',
              ),
              const SizedBox(height: 12),
              Text(
                program.title,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 16),
              Text(program.description),
              const PageSection('Your program guide'),
              Text(
                program.doctor.name,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              Text(
                program.doctor.isDemo
                    ? 'DEMO profile · No real credentials represented'
                    : program.doctor.verified
                    ? 'Verified professional'
                    : 'Verification pending',
              ),
              Text(
                '${program.doctor.qualification} · ${program.doctor.specialty}',
              ),
              if (program.doctor.experienceYears != null)
                Text('${program.doctor.experienceYears} years of experience'),
              Text(program.doctor.biography),
              PageSection('Who this is for', subtitle: program.audience),
              const PageSection('What you will learn'),
              for (final outcome in program.outcomes)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text('• $outcome'),
                ),
              Text(
                '${program.durationMinutes} minutes · ${program.isLive ? '${program.sessionCount} sessions' : '${program.lessonCount} lessons'} · ${program.price}',
              ),
              if (program.isLive) LiveSchedule(program: program),
              if (!program.isLive) ...[
                const PageSection('Inside the program'),
                for (final module in program.modules)
                  ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: Text(module.title),
                    children: [
                      for (final lesson in module.lessons)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(lesson.title),
                          subtitle: Text('${lesson.durationSeconds} seconds'),
                          leading: Icon(
                            program.enrolled
                                ? Icons.play_circle_outline
                                : Icons.lock_outline,
                          ),
                        ),
                    ],
                  ),
              ],
              const SizedBox(height: 24),
              const Text(educationNotice),
              const SizedBox(height: 24),
              if (action.hasError)
                ErrorNotice(message: programError(action.error)),
              if (program.pricePaise > 0 &&
                  !program.memberAccess &&
                  !program.membershipRequired &&
                  !program.enrolled &&
                  program.paymentMode == 'disabled')
                const Text(
                  'Paid enrollment will open when secure payments are available.',
                ),
              ActionButton(
                label: program.membershipRequired
                    ? 'Explore membership'
                    : program.enrolled
                    ? 'Continue Program'
                    : program.memberAccess
                    ? 'Join with membership'
                    : program.pricePaise > 0
                    ? 'Purchase · ${program.price}'
                    : program.isLive
                    ? 'Join Live Program'
                    : 'Enroll Now',
                busy: action.isLoading,
                onPressed:
                    program.pricePaise > 0 &&
                        !program.memberAccess &&
                        !program.membershipRequired &&
                        !program.enrolled &&
                        program.paymentMode == 'disabled'
                    ? null
                    : () => join(context, ref, program),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
