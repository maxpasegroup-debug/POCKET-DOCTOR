import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/privacy_providers.dart';

class PrivacyScreen extends ConsumerWidget {
  const PrivacyScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final privacy = ref.watch(privacyProvider),
        action = ref.watch(privacyActionsProvider);
    return DetailPage(
      title: 'Privacy & account',
      children: [
        Text(
          'Your information. Your choices.',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: 16),
        const Text(
          'Manage how Pocket Doctor supports you. Marketing permission is separate from account and health services.',
        ),
        const SizedBox(height: 24),
        privacy.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => Column(
            children: [
              const ErrorNotice(message: 'We could not load your preferences.'),
              TextButton(
                onPressed: () => ref.invalidate(privacyProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
          data: (data) {
            final consents = (data['consents'] as List)
                .cast<Map<String, dynamic>>();
            final policies = (data['policies'] as List)
                .cast<Map<String, dynamic>>();
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final choice in const [
                  ('COMMUNICATION', 'Service communications'),
                  ('MARKETING', 'Offers & marketing'),
                ])
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(choice.$2),
                    value: consents.any(
                      (c) => c['type'] == choice.$1 && c['granted'] == true,
                    ),
                    onChanged: action.isLoading
                        ? null
                        : (v) => ref
                              .read(privacyActionsProvider.notifier)
                              .consent(choice.$1, v),
                  ),
                const Divider(),
                const PageSection('Policies'),
                if (policies.isEmpty)
                  const Text(
                    'Approved policies have not been published. Legal review is required before public launch.',
                  ),
                for (final p in policies)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('${p['type']} · ${p['version']}'),
                    subtitle: SelectableText(
                      '${p['approved'] == true ? 'Published' : 'Review pending'}\n${p['url']}',
                    ),
                  ),
              ],
            );
          },
        ),
        if (action.isLoading) const LinearProgressIndicator(),
        if (action.hasError)
          const ErrorNotice(
            message: 'Your change could not be saved. Please try again.',
          ),
        const SizedBox(height: 16),
        ListTile(
          title: const Text('Assistant data & chat permissions'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push('/assistant/settings'),
        ),
        ListTile(
          title: const Text('WhatsApp connection'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push('/assistant/whatsapp'),
        ),
        ListTile(
          title: const Text('View & export my information'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push('/settings/export'),
        ),
        const Divider(),
        const PageSection('Delete account access'),
        const Text(
          'This ends access and signs you out immediately. A privacy review handles retained financial, consultation and audit records. This request does not erase all records automatically.',
        ),
        const SizedBox(height: 16),
        OutlinedButton(
          onPressed: action.isLoading
              ? null
              : () async {
                  final accepted = await showDialog<bool>(
                    context: context,
                    builder: (c) => AlertDialog(
                      title: const Text('Request account deletion?'),
                      content: const Text(
                        'You will be signed out and cannot sign in again while the request is reviewed. Retained records are handled separately.',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(c, false),
                          child: const Text('Keep my account'),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(c, true),
                          child: const Text('End access & request deletion'),
                        ),
                      ],
                    ),
                  );
                  if (accepted == true) {
                    await ref
                        .read(privacyActionsProvider.notifier)
                        .deleteAccess();
                  }
                },
          child: const Text('Request account deletion'),
        ),
      ],
    );
  }
}

class PrivacyExportScreen extends ConsumerStatefulWidget {
  const PrivacyExportScreen({super.key});
  @override
  ConsumerState<PrivacyExportScreen> createState() => _PrivacyExportState();
}

class _PrivacyExportState extends ConsumerState<PrivacyExportScreen> {
  String category = 'profile';
  int page = 1;
  @override
  Widget build(BuildContext context) {
    final key = (category, page),
        data = ref.watch(privacyExportProvider((category, page)));
    return DetailPage(
      title: 'My information',
      children: [
        const Text(
          'This private export contains only your account information. Copy the selected page if you want to keep a record. Store any copy securely.',
        ),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          initialValue: category,
          decoration: const InputDecoration(labelText: 'Information to view'),
          items: [
            for (final c in [
              'profile',
              'programs',
              'orders',
              'memberships',
              'appointments',
              'memories',
              'conversations',
              'messages',
              'goals',
              'checkins',
              'reminders',
              'addresses',
              'consents',
            ])
              DropdownMenuItem(
                value: c,
                child: Text(c[0].toUpperCase() + c.substring(1)),
              ),
          ],
          onChanged: (v) {
            if (v != null) {
              setState(() {
                category = v;
                page = 1;
              });
            }
          },
        ),
        const SizedBox(height: 24),
        data.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => Column(
            children: [
              const ErrorNotice(message: 'We could not prepare your export.'),
              TextButton(
                onPressed: () => ref.invalidate(privacyExportProvider(key)),
                child: const Text('Retry'),
              ),
            ],
          ),
          data: (value) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if ((value['items'] as List).isEmpty)
                const Text('There are no records in this section.')
              else
                SelectableText(
                  const JsonEncoder.withIndent('  ').convert(value['items']),
                ),
              const SizedBox(height: 20),
              Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  TextButton(
                    onPressed: page > 1 ? () => setState(() => page--) : null,
                    child: const Text('Previous'),
                  ),
                  Text('Page $page'),
                  TextButton(
                    onPressed: value['hasMore'] == true
                        ? () => setState(() => page++)
                        : null,
                    child: const Text('Next'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}
