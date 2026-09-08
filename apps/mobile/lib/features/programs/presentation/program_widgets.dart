import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/networking/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../domain/program_models.dart';

String programError(Object? error) => error is ApiFailure
    ? error.message
    : 'We could not complete that request. Please try again.';

class ProgramAsync<T> extends StatelessWidget {
  const ProgramAsync({
    super.key,
    required this.value,
    required this.onRetry,
    required this.builder,
  });
  final AsyncValue<T> value;
  final VoidCallback onRetry;
  final Widget Function(T) builder;
  @override
  Widget build(BuildContext context) => value.when(
    skipLoadingOnRefresh: false,
    data: builder,
    loading: () => const Padding(
      padding: EdgeInsets.all(24),
      child: Center(
        child: CircularProgressIndicator(semanticsLabel: 'Loading programs'),
      ),
    ),
    error: (error, _) => ErrorNotice(
      message: error is ApiFailure
          ? error.message
          : 'We could not load your programs. Please try again.',
      onRetry: onRetry,
    ),
  );
}

class ProgramCard extends StatelessWidget {
  const ProgramCard({super.key, required this.program, this.overview});
  final Program program;
  final ProgramOverview? overview;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 20),
    child: Card(
      clipBehavior: Clip.antiAlias,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: AppColors.border),
      ),
      child: InkWell(
        onTap: () => context.push(
          overview == null
              ? '/programs/${program.id}'
              : '/my-programs/${program.id}',
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ProgramCover(program: program),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${program.isLive ? 'LIVE' : 'RECORDED'} · ${program.category.name}',
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    program.title,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(program.doctor.name),
                  const SizedBox(height: 12),
                  Text(
                    '${program.durationMinutes} min · ${program.isLive ? '${program.sessionCount} sessions' : '${program.lessonCount} lessons'} · ${program.price}',
                  ),
                  const SizedBox(height: 8),
                  if (overview != null)
                    ProgramProgress(overview: overview!)
                  else
                    Text(
                      program.enrolled
                          ? 'Enrolled · Continue your journey'
                          : 'Explore program →',
                      style: const TextStyle(color: AppColors.green),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class ProgramCover extends StatelessWidget {
  const ProgramCover({super.key, required this.program});
  final Program program;
  @override
  Widget build(BuildContext context) {
    final placeholder = Container(
      width: double.infinity,
      color: AppColors.navy,
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            program.isLive ? Icons.groups_outlined : Icons.menu_book_outlined,
            size: 40,
            color: const Color(0xFF8DE9BA),
          ),
          const SizedBox(height: 12),
          Text(
            program.isDemo ? 'DEMO · LEARN & TRANSFORM' : 'LEARN & TRANSFORM',
            style: Theme.of(
              context,
            ).textTheme.labelLarge?.copyWith(color: Colors.white),
          ),
        ],
      ),
    );
    final url = program.coverUrl;
    return url == null
        ? placeholder
        : Image.network(
            url,
            width: double.infinity,
            height: 160,
            fit: BoxFit.cover,
            semanticLabel: '${program.title} cover',
            errorBuilder: (_, _, _) => placeholder,
          );
  }
}

class ProgramProgress extends StatelessWidget {
  const ProgramProgress({super.key, required this.overview});
  final ProgramOverview overview;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      if (!overview.program.isLive) ...[
        LinearProgressIndicator(
          value: overview.percentage / 100,
          semanticsLabel: 'Program progress',
          semanticsValue: '${overview.percentage}%',
        ),
        const SizedBox(height: 8),
        Text(
          '${overview.completedLessons} / ${overview.totalLessons} required lessons · ${overview.percentage}%',
        ),
      ],
      const SizedBox(height: 8),
      Text(
        overview.completed
            ? 'Completed · ${dateLabel(overview.completedAt!)}'
            : overview.program.isLive
            ? 'Enrolled · View schedule'
            : 'Continue learning',
      ),
    ],
  );
}

String dateLabel(DateTime date) {
  final local = date.toLocal();
  return '${local.day}/${local.month}/${local.year}';
}

class LiveSchedule extends StatelessWidget {
  const LiveSchedule({super.key, required this.program});
  final Program program;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const PageSection('Live schedule'),
      if (program.liveSessions.isEmpty)
        const Text('The schedule has not been announced yet.'),
      for (final session in program.liveSessions)
        Padding(
          padding: const EdgeInsets.only(bottom: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                session.title,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              Text(
                '${dateLabel(session.startsAt)} · ${TimeOfDay.fromDateTime(session.startsAt.toLocal()).format(context)} (your local time) · ${session.durationMinutes} min',
              ),
              Text(session.status),
              if (session.information != null) Text(session.information!),
              const SizedBox(height: 8),
              const Text('Live joining is not available yet.'),
            ],
          ),
        ),
    ],
  );
}

const educationNotice =
    'For health education. This does not replace professional medical advice. Consult a qualified healthcare professional for personal medical decisions.';
