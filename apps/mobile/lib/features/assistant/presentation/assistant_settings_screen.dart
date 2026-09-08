import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/assistant_providers.dart';
import '../domain/assistant_models.dart';

class AssistantSettingsScreen extends ConsumerWidget {
  const AssistantSettingsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final action = ref.watch(assistantActionsProvider);
    return DetailPage(
      title: 'Assistant privacy & settings',
      children: [
        const Text('You control what you share.'),
        const SizedBox(height: 12),
        const Text(
          'When you allow chat processing, your message and up to four shortened prior messages are sent to the configured AI provider. Local demo mode uses no external provider. Account facts, doctor notes and saved tracking entries are not sent to the model. Messages are stored in your account until you delete the conversation. This setting does not enable background reminders.',
        ),
        const SizedBox(height: 20),
        ref
            .watch(assistantPreferencesProvider)
            .when(
              data: (prefs) => Column(
                children: [
                  for (final entry in assistantPreferenceLabels.entries)
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(entry.value),
                      value: prefs[entry.key] ?? false,
                      onChanged: action.isLoading
                          ? null
                          : (v) => ref
                                .read(assistantActionsProvider.notifier)
                                .run(
                                  (r) => r.savePreferences({
                                    ...prefs,
                                    entry.key: v,
                                  }),
                                ),
                    ),
                ],
              ),
              loading: () => const CircularProgressIndicator(),
              error: (e, _) => ErrorNotice(
                message: e.toString(),
                onRetry: () => ref.invalidate(assistantPreferencesProvider),
              ),
            ),
        if (action.hasError) ErrorNotice(message: action.error.toString()),
        TextButton(
          onPressed: () => context.push('/assistant/memory'),
          child: const Text('Manage AI Memory'),
        ),
        TextButton(
          onPressed: () => context.push('/assistant/history'),
          child: const Text('Manage conversations'),
        ),
        TextButton(
          onPressed: () => context.push('/assistant/whatsapp'),
          child: const Text('Connect WhatsApp'),
        ),
        const SizedBox(height: 16),
        const Text(
          'WhatsApp preferences are saved for a future connected provider. No promotional messages or external reminders are sent.',
        ),
      ],
    );
  }
}

class WhatsAppLinkScreen extends ConsumerStatefulWidget {
  const WhatsAppLinkScreen({super.key});
  @override
  ConsumerState<WhatsAppLinkScreen> createState() => _WhatsAppState();
}

class _WhatsAppState extends ConsumerState<WhatsAppLinkScreen> {
  String? code, instruction;
  @override
  Widget build(BuildContext context) {
    final action = ref.watch(assistantActionsProvider);
    return DetailPage(
      title: 'Connect WhatsApp',
      children: [
        const Text(
          'Link only a WhatsApp account you control. Pocket Doctor never signs you in merely because a phone number matches.',
        ),
        const SizedBox(height: 20),
        ref
            .watch(whatsappStatusProvider)
            .when(
              data: (status) => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    status['connected'] == true
                        ? 'Connected: ${status['maskedIdentity']}'
                        : 'Not connected',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'WhatsApp delivery is not operational yet. This screen prepares a secure connection; no messages or reminders are delivered.',
                  ),
                  const SizedBox(height: 16),
                  if (status['providerReady'] != true)
                    const Text(
                      'The Pocket Doctor WhatsApp provider has not been configured.',
                    ),
                  if (status['providerReady'] == true)
                    FilledButton(
                      onPressed: action.isLoading
                          ? null
                          : () async {
                              final result = await ref
                                  .read(assistantActionsProvider.notifier)
                                  .run(
                                    (r) => r.request(
                                      'POST',
                                      '/integrations/whatsapp/link',
                                      {},
                                    ),
                                  );
                              if (mounted && result != null) {
                                setState(() {
                                  code = result['code'] as String;
                                  instruction = result['instruction'] as String;
                                });
                              }
                            },
                      child: const Text('Generate linking code'),
                    ),
                  if (code != null) ...[
                    const SizedBox(height: 16),
                    SelectableText('LINK $code'),
                    Text(instruction ?? ''),
                  ],
                  if (status['pendingIdentity'] != null) ...[
                    Text(
                      'WhatsApp number awaiting confirmation: ${status['pendingIdentity']}',
                    ),
                    FilledButton(
                      onPressed: action.isLoading
                          ? null
                          : () async {
                              final confirmed = await showDialog<bool>(
                                context: context,
                                builder: (c) => AlertDialog(
                                  title: Text(
                                    'Is ${status['pendingIdentity']} your WhatsApp account?',
                                  ),
                                  content: const Text(
                                    'Confirm only if you sent this linking code yourself.',
                                  ),
                                  actions: [
                                    TextButton(
                                      onPressed: () => Navigator.pop(c, false),
                                      child: const Text('Cancel'),
                                    ),
                                    FilledButton(
                                      onPressed: () => Navigator.pop(c, true),
                                      child: const Text('Confirm connection'),
                                    ),
                                  ],
                                ),
                              );
                              if (confirmed == true) {
                                await ref
                                    .read(assistantActionsProvider.notifier)
                                    .run(
                                      (r) => r.request(
                                        'POST',
                                        '/integrations/whatsapp/confirm',
                                        {},
                                      ),
                                    );
                                if (mounted) setState(() => code = null);
                              }
                            },
                      child: const Text('Review connection'),
                    ),
                  ],
                  TextButton(
                    onPressed: () => ref.invalidate(whatsappStatusProvider),
                    child: const Text('Refresh connection status'),
                  ),
                  TextButton(
                    onPressed: action.isLoading
                        ? null
                        : () async {
                            await ref
                                .read(assistantActionsProvider.notifier)
                                .run(
                                  (r) => r.request(
                                    'DELETE',
                                    '/integrations/whatsapp/link',
                                  ),
                                );
                            if (mounted) setState(() => code = null);
                          },
                    child: const Text('Disconnect / cancel linking'),
                  ),
                  TextButton(
                    onPressed: () => context.push('/assistant/settings'),
                    child: const Text('Notification preferences'),
                  ),
                ],
              ),
              loading: () => const CircularProgressIndicator(),
              error: (e, _) => ErrorNotice(
                message: e.toString(),
                onRetry: () => ref.invalidate(whatsappStatusProvider),
              ),
            ),
        if (action.hasError) ErrorNotice(message: action.error.toString()),
      ],
    );
  }
}
