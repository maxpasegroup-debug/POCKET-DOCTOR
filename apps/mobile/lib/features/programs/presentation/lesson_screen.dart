import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:video_player/video_player.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/program_providers.dart';
import '../domain/program_models.dart';
import 'program_widgets.dart';

class LessonProgressController extends Notifier<AsyncValue<void>> {
  LessonProgressController(this.ids);
  final (String, String) ids;
  Future<bool>? pending;
  @override
  AsyncValue<void> build() {
    ref.watch(programRepositoryProvider);
    return const AsyncData(null);
  }

  Future<bool> save(int position, bool completed) async {
    while (pending != null) {
      await pending;
      if (!ref.mounted) return false;
    }
    final operation = performSave(position, completed);
    pending = operation;
    try {
      return await operation;
    } finally {
      if (identical(pending, operation)) pending = null;
    }
  }

  Future<bool> performSave(int position, bool completed) async {
    state = const AsyncLoading();
    final result = await AsyncValue.guard(() async {
      await ref
          .read(programRepositoryProvider)
          .progress(ids.$1, ids.$2, position, completed);
    });
    if (!ref.mounted) return false;
    state = result;
    if (!result.hasError) {
      ref.invalidate(programOverviewProvider(ids.$1));
      ref.invalidate(myProgramsProvider);
    }
    return !result.hasError;
  }
}

final lessonProgressProvider = NotifierProvider.autoDispose
    .family<LessonProgressController, AsyncValue<void>, (String, String)>(
      LessonProgressController.new,
    );

class LessonScreen extends ConsumerWidget {
  const LessonScreen({
    super.key,
    required this.programId,
    required this.lessonId,
  });
  final String programId, lessonId;
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(title: const Text('Your lesson')),
    body: SafeArea(
      child: ProgramAsync(
        value: ref.watch(programLessonProvider((programId, lessonId))),
        onRetry: () =>
            ref.invalidate(programLessonProvider((programId, lessonId))),
        builder: (lesson) => _LessonBody(
          key: ValueKey(lessonId),
          programId: programId,
          lesson: lesson,
        ),
      ),
    ),
  );
}

class _LessonBody extends ConsumerStatefulWidget {
  const _LessonBody({super.key, required this.programId, required this.lesson});
  final String programId;
  final ProgramLesson lesson;
  @override
  ConsumerState<_LessonBody> createState() => _LessonBodyState();
}

class _LessonBodyState extends ConsumerState<_LessonBody>
    with WidgetsBindingObserver {
  VideoPlayerController? player;
  Timer? timer;
  bool mediaFailed = false, ready = false, allowPop = false, completed = false;
  int position = 0;
  bool wasPlaying = false;
  (String, String) get ids => (widget.programId, widget.lesson.id);
  @override
  void initState() {
    super.initState();
    completed = widget.lesson.completed;
    position = widget.lesson.positionSeconds;
    WidgetsBinding.instance.addObserver(this);
    unawaited(initialize());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(save(false));
    });
    timer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (player?.value.isPlaying == true) unawaited(save(false));
    });
  }

  Future<void> initialize() async {
    final url = widget.lesson.mediaUrl;
    if (url == null) {
      setState(() => ready = true);
      return;
    }
    final controller = VideoPlayerController.networkUrl(Uri.parse(url));
    player = controller;
    try {
      await controller.initialize().timeout(const Duration(seconds: 20));
      if (!mounted || player != controller) return;
      await controller.seekTo(Duration(seconds: position));
      controller.addListener(onVideo);
      setState(() {
        ready = true;
        mediaFailed = false;
      });
    } catch (_) {
      if (mounted) setState(() => mediaFailed = true);
    }
  }

  void onVideo() {
    if (!mounted) return;
    position = player!.value.position.inSeconds.clamp(
      0,
      widget.lesson.durationSeconds,
    );
    if (player!.value.hasError) setState(() => mediaFailed = true);
    if (wasPlaying != player!.value.isPlaying) {
      final stopped = wasPlaying;
      setState(() => wasPlaying = player!.value.isPlaying);
      if (stopped) unawaited(save(false));
    }
  }

  Future<bool> save(bool complete) async {
    final result = await ref
        .read(lessonProgressProvider(ids).notifier)
        .save(position, complete || completed);
    if (mounted && result && complete) setState(() => completed = true);
    return result;
  }

  Future<void> leave() async {
    await player?.pause();
    if (!mounted || !await save(false) || !mounted) return;
    setState(() => allowPop = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (context.canPop()) {
        context.pop();
      } else {
        context.go('/my-programs/${widget.programId}');
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused) {
      unawaited(player?.pause());
      if (mounted) unawaited(save(false));
    }
  }

  @override
  void dispose() {
    timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    player?.removeListener(onVideo);
    unawaited(player?.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final progress = ref.watch(lessonProgressProvider(ids));
    return PopScope(
      canPop: allowPop,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) unawaited(leave());
      },
      child: SingleChildScrollView(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (widget.lesson.isDemo)
                    const Text('DEMO LESSON · Not a published medical program'),
                  const SizedBox(height: 12),
                  Text(
                    widget.lesson.title,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 24),
                  if (mediaFailed)
                    ErrorNotice(
                      message:
                          'The video could not load. Check your connection and try again.',
                      onRetry: () async {
                        await player?.dispose();
                        player = null;
                        if (!mounted) return;
                        setState(() {
                          mediaFailed = false;
                          ready = false;
                        });
                        unawaited(initialize());
                      },
                    )
                  else if (!ready)
                    const Center(
                      child: CircularProgressIndicator(
                        semanticsLabel: 'Loading video',
                      ),
                    )
                  else if (player != null) ...[
                    AspectRatio(
                      aspectRatio: player!.value.aspectRatio,
                      child: VideoPlayer(player!),
                    ),
                    VideoProgressIndicator(
                      player!,
                      allowScrubbing: true,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                    Wrap(
                      spacing: 12,
                      children: [
                        FilledButton.icon(
                          onPressed: () async {
                            if (player!.value.isPlaying) {
                              await player!.pause();
                              if (mounted) unawaited(save(false));
                            } else {
                              await player!.play();
                              if (mounted) unawaited(save(false));
                            }
                            if (mounted) setState(() {});
                          },
                          icon: Icon(
                            player!.value.isPlaying
                                ? Icons.pause
                                : Icons.play_arrow,
                          ),
                          label: Text(
                            player!.value.isPlaying ? 'Pause' : 'Play',
                          ),
                        ),
                        OutlinedButton(
                          onPressed: progress.isLoading
                              ? null
                              : () => save(false),
                          child: const Text('Save position'),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 24),
                  Text(widget.lesson.description),
                  const PageSection('Key points'),
                  for (final point in widget.lesson.keyPoints)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text('• $point'),
                    ),
                  PageSection(
                    'Supporting material',
                    subtitle: widget.lesson.supportingMaterial,
                  ),
                  if (progress.hasError)
                    ErrorNotice(
                      message:
                          'Your latest progress could not be saved. Please try again before leaving.',
                      onRetry: () => save(false),
                    ),
                  if (completed) const Text('Lesson completed'),
                  const SizedBox(height: 24),
                  ActionButton(
                    label: completed
                        ? 'Completed · Save and continue'
                        : 'Mark lesson complete',
                    busy: progress.isLoading,
                    onPressed: ready && !mediaFailed
                        ? () async {
                            if (!await save(true) || !context.mounted) return;
                            final next = widget.lesson.nextLessonId;
                            if (next != null) {
                              context.pushReplacement(
                                '/my-programs/${widget.programId}/lessons/$next',
                              );
                            } else {
                              context.go('/my-programs/${widget.programId}');
                            }
                          }
                        : null,
                  ),
                  TextButton(
                    onPressed: progress.isLoading ? null : leave,
                    child: const Text('Save and return to program'),
                  ),
                  if (progress.hasError)
                    TextButton(
                      onPressed: () {
                        setState(() => allowPop = true);
                        context.go('/my-programs/${widget.programId}');
                      },
                      child: const Text('Leave without saving latest position'),
                    ),
                  const SizedBox(height: 24),
                  const Text(educationNotice),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
