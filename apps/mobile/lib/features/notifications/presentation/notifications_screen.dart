import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../../privacy/application/privacy_providers.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});
  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsState();
}

class _NotificationsState extends ConsumerState<NotificationsScreen> {
  int page = 1;
  @override
  Widget build(BuildContext context) {
    final value = ref.watch(notificationInboxProvider(page));
    return DetailPage(
      title: 'Notifications',
      children: [
        Text(
          'Your updates, in one place.',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: 12),
        const Text(
          'Account, program, appointment, order and membership updates. External delivery depends on your preferences and available channels.',
        ),
        const SizedBox(height: 24),
        value.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => Column(
            children: [
              const ErrorNotice(message: 'We could not load your updates.'),
              TextButton(
                onPressed: () =>
                    ref.invalidate(notificationInboxProvider(page)),
                child: const Text('Retry'),
              ),
            ],
          ),
          data: (data) {
            final items = (data['items'] as List).cast<Map<String, dynamic>>();
            return Column(
              children: [
                if (items.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      'You are all caught up. New updates will appear here.',
                    ),
                  ),
                for (final n in items)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(
                      n['readAt'] == null
                          ? Icons.notifications_active_outlined
                          : Icons.notifications_none,
                    ),
                    title: Text(n['text'] as String),
                    subtitle: Text(n['readAt'] == null ? 'Unread' : 'Read'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () async {
                      try {
                        await ref
                            .read(privacyRepositoryProvider)
                            .markRead(n['id'] as String);
                        ref.invalidate(notificationInboxProvider(page));
                        if (!context.mounted) return;
                        final route = n['route'] as String;
                        if (RegExp(
                          r'^/(profile|membership/(manage|invoices/[a-f0-9-]+)|my-consultations|orders/[a-f0-9-]+|programs/[a-f0-9-]+)$',
                        ).hasMatch(route)) {
                          context.push(route);
                        }
                      } catch (_) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text(
                                'We could not open that update. Please try again.',
                              ),
                            ),
                          );
                        }
                      }
                    },
                  ),
                Wrap(
                  alignment: WrapAlignment.center,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    TextButton(
                      onPressed: page > 1 ? () => setState(() => page--) : null,
                      child: const Text('Previous'),
                    ),
                    Text('Page $page'),
                    TextButton(
                      onPressed: data['hasMore'] == true
                          ? () => setState(() => page++)
                          : null,
                      child: const Text('Next'),
                    ),
                  ],
                ),
              ],
            );
          },
        ),
        const SizedBox(height: 24),
        TextButton(
          onPressed: () => context.push('/settings/privacy'),
          child: const Text('Communication preferences'),
        ),
        TextButton(
          onPressed: () => context.push('/assistant/reminders'),
          child: const Text('My wellness reminders'),
        ),
      ],
    );
  }
}
