import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/assistant_providers.dart';
import '../domain/assistant_models.dart';
import 'assistant_navigation.dart';

class AssistantChatScreen extends ConsumerStatefulWidget {
  const AssistantChatScreen({super.key, required this.id});
  final String id;
  @override
  ConsumerState<AssistantChatScreen> createState() => _ChatState();
}

class _ChatState extends ConsumerState<AssistantChatScreen> {
  final text = TextEditingController();
  String key = assistantRequestKey(), last = '';
  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  Future<void> send() async {
    final value = text.text.trim();
    if (value.isEmpty || value.length > 2000) return;
    if (last != value) {
      key = assistantRequestKey();
      last = value;
    }
    final result = await ref.read(assistantActionsProvider.notifier).run((
      r,
    ) async {
      await r.send(widget.id, value, key);
      return true;
    });
    if (result == true) {
      text.clear();
      last = '';
      key = assistantRequestKey();
    }
  }

  @override
  Widget build(BuildContext context) {
    final action = ref.watch(assistantActionsProvider);
    return DetailPage(
      title: 'Pocket Doctor Assistant',
      children: [
        const Text(
          'General wellness support. Not a substitute for professional medical care.',
        ),
        const SizedBox(height: 20),
        ref
            .watch(assistantChatProvider(widget.id))
            .when(
              data: (chat) => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (chat.messages.isEmpty) ...[
                    Text(
                      'Let’s start with you.',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Choose a question or write your own. Memory and reminders are never saved automatically.',
                    ),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final prompt in [
                          'Check my progress',
                          'My wellness plan',
                          'My reminders',
                          'Prepare me for my appointment',
                          'My orders',
                        ])
                          ActionChip(
                            label: Text(prompt),
                            onPressed: () {
                              text.text = prompt;
                            },
                          ),
                      ],
                    ),
                  ],
                  for (final turn in chat.messages) ...[
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      child: Text(
                        'You\n${turn.prompt}',
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                    ),
                    FoundationCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            turn.reply.classification == 'emergency'
                                ? 'Seek immediate help'
                                : 'Pocket Doctor Assistant',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 8),
                          SelectableText(turn.reply.text),
                          if (turn.reply.mode == 'development')
                            const Padding(
                              padding: EdgeInsets.only(top: 8),
                              child: Text('Development response'),
                            ),
                          for (final fact in turn.reply.facts)
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(fact.label),
                              subtitle: Text(fact.value),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: validAssistantRoute(fact.route)
                                  ? () => openAssistantDestination(
                                      context,
                                      fact.route,
                                    )
                                  : null,
                            ),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (final a in turn.reply.actions)
                                if (validAssistantRoute(a.route))
                                  TextButton(
                                    onPressed: () => openAssistantDestination(
                                      context,
                                      a.route,
                                    ),
                                    child: Text(a.label),
                                  ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorNotice(
                message: e.toString(),
                onRetry: () => ref.invalidate(assistantChatProvider(widget.id)),
              ),
            ),
        const SizedBox(height: 24),
        if (action.isLoading)
          const LinearProgressIndicator(
            semanticsLabel: 'Assistant is responding',
          ),
        if (action.hasError)
          ErrorNotice(message: action.error.toString(), onRetry: send),
        TextField(
          controller: text,
          minLines: 2,
          maxLines: 5,
          maxLength: 2000,
          enabled: !action.isLoading,
          decoration: const InputDecoration(
            labelText: 'Your message',
            hintText: 'What would help today?',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: action.isLoading ? null : send,
          icon: const Icon(Icons.arrow_upward),
          label: const Text('Send message'),
        ),
        TextButton(
          onPressed: () => context.push('/assistant/settings'),
          child: const Text('Chat consent & privacy'),
        ),
      ],
    );
  }
}
