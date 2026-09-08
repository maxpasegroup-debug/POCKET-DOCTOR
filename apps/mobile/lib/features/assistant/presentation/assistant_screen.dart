import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/assistant_providers.dart';
import '../domain/assistant_models.dart';
import 'assistant_navigation.dart';

class AssistantScreen extends ConsumerWidget {
  const AssistantScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final action = ref.watch(assistantActionsProvider);
    return PageBody(
      children: [
        const SectionHeading(
          eyebrow: 'Pocket Doctor Assistant',
          title: 'Your personal health companion.',
          description:
              'A calm space to reflect, remember and take your next step.',
        ),
        FoundationCard(
          color: AppColors.sky,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const CircleAvatar(
                backgroundColor: Colors.white,
                radius: 26,
                child: Icon(
                  Icons.smart_toy_outlined,
                  color: AppColors.information,
                  size: 28,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'What would help today?',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              const Text(
                'General wellness support, guided by you. Your assistant is not a doctor.',
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: action.isLoading
                    ? null
                    : () async {
                        final id = await ref
                            .read(assistantActionsProvider.notifier)
                            .run((r) => r.createConversation());
                        if (context.mounted && id != null) {
                          context.push('/assistant/chat/$id');
                        }
                      },
                icon: const Icon(Icons.chat_bubble_outline),
                label: const Text('Start a conversation'),
              ),
              TextButton(
                onPressed: () => context.push('/assistant/history'),
                child: const Text('Conversation history'),
              ),
            ],
          ),
        ),
        if (action.hasError) ErrorNotice(message: action.error.toString()),
        const SizedBox(height: 20),
        ref
            .watch(assistantStatusProvider)
            .when(
              data: (s) => Text(
                s['provider'] == 'development'
                    ? 'Local demo assistant · controlled sample responses'
                    : s['available'] == true
                    ? 'Assistant connected · general wellness support'
                    : 'Your Pocket Doctor Assistant is temporarily unavailable. Your goals and reminders are still available.',
              ),
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => ErrorNotice(
                message: e.toString(),
                onRetry: () => ref.invalidate(assistantStatusProvider),
              ),
            ),
        const PageSection('Your wellness space'),
        ref
            .watch(assistantRecordsProvider((WellnessRecordKind.goals, 1)))
            .when(
              data: (items) => items.isEmpty
                  ? const Padding(
                      padding: EdgeInsets.only(bottom: 16),
                      child: Text('Your next goal starts with a small choice.'),
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        for (final item in items.take(3))
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(item.title),
                            subtitle: Text(item.summary),
                            onTap: () => context.push('/assistant/goals'),
                          ),
                      ],
                    ),
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => ErrorNotice(
                message: e.toString(),
                onRetry: () => ref.invalidate(
                  assistantRecordsProvider((WellnessRecordKind.goals, 1)),
                ),
              ),
            ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final kind in WellnessRecordKind.values)
              OutlinedButton(
                onPressed: () => context.push(kind.route),
                child: Text(kind.title),
              ),
          ],
        ),
        const PageSection('Your next step'),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final entry in {
              'My Programs': '/my-programs',
              'My Consultations': '/my-consultations',
              'My Orders': '/orders',
              'Talk to a Doctor': '/consult',
            }.entries)
              TextButton(
                onPressed: () => openAssistantDestination(context, entry.value),
                child: Text(entry.key),
              ),
          ],
        ),
        const PageSection('Reminders'),
        ref
            .watch(assistantReminderEventsProvider)
            .when(
              data: (items) => items.isEmpty
                  ? const Text(
                      'No reminders due. Add one whenever it is useful.',
                    )
                  : Column(
                      children: [
                        for (final item in items)
                          ListTile(
                            title: Text(item['title'] as String),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () => context.push(item['route'] as String),
                          ),
                      ],
                    ),
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => ErrorNotice(
                message: e.toString(),
                onRetry: () => ref.invalidate(assistantReminderEventsProvider),
              ),
            ),
        const SizedBox(height: 20),
        TextButton.icon(
          onPressed: () => context.push('/assistant/settings'),
          icon: const Icon(Icons.tune),
          label: const Text('Assistant privacy & settings'),
        ),
        TextButton.icon(
          onPressed: () => context.push('/assistant/whatsapp'),
          icon: const Icon(Icons.link),
          label: const Text('Connect WhatsApp'),
        ),
      ],
    );
  }
}

class AssistantHistoryScreen extends ConsumerStatefulWidget {
  const AssistantHistoryScreen({super.key});
  @override
  ConsumerState<AssistantHistoryScreen> createState() => _HistoryState();
}

class _HistoryState extends ConsumerState<AssistantHistoryScreen> {
  int page = 1;
  @override
  Widget build(BuildContext context) {
    final action = ref.watch(assistantActionsProvider);
    return DetailPage(
      title: 'Conversation history',
      children: [
        const Text(
          'Messages stay in each conversation. Long-term memory is saved separately, only when you choose.',
        ),
        if (action.hasError) ErrorNotice(message: action.error.toString()),
        ref
            .watch(assistantHistoryProvider(page))
            .when(
              data: (items) => Column(
                children: [
                  if (items.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('No conversations yet.'),
                    ),
                  for (final item in items)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        'Conversation · ${item.createdAt.toLocal().toString().substring(0, 16)}',
                      ),
                      onTap: () => context.push('/assistant/chat/${item.id}'),
                      trailing: IconButton(
                        tooltip: 'Delete conversation',
                        icon: const Icon(Icons.delete_outline),
                        onPressed: action.isLoading
                            ? null
                            : () async {
                                if (await confirmAssistantDelete(
                                  context,
                                  'Delete this conversation and its messages?',
                                )) {
                                  await ref
                                      .read(assistantActionsProvider.notifier)
                                      .run(
                                        (r) => r.deleteConversation(item.id),
                                      );
                                }
                              },
                      ),
                    ),
                  Wrap(
                    spacing: 12,
                    children: [
                      if (page > 1)
                        TextButton(
                          onPressed: () => setState(() => page--),
                          child: const Text('Previous'),
                        ),
                      if (items.length == 20)
                        TextButton(
                          onPressed: () => setState(() => page++),
                          child: const Text('Next'),
                        ),
                    ],
                  ),
                ],
              ),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorNotice(
                message: e.toString(),
                onRetry: () => ref.invalidate(assistantHistoryProvider(page)),
              ),
            ),
      ],
    );
  }
}

Future<bool> confirmAssistantDelete(BuildContext context, String title) async =>
    await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(title),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Keep'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    ) ??
    false;
