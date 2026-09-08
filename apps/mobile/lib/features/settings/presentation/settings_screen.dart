import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../../auth/application/auth_controller.dart';
import '../../profile/domain/user_profile.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final user = auth.user;
    return DetailPage(
      title: 'Settings',
      children: [
        const PageSection('Make it work for you'),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Service communications'),
          subtitle: const Text(
            'Allow service updates on connected channels. In-app updates remain available.',
          ),
          value: user?.notifications ?? false,
          onChanged: auth.busy || user == null
              ? null
              : (value) => ref
                    .read(authProvider.notifier)
                    .saveProfile(
                      ProfileDraft(
                        fullName: user.fullName!,
                        language: user.language,
                        interests: user.interests,
                        notifications: value,
                      ),
                    ),
        ),
        if (auth.busy) const LinearProgressIndicator(),
        if (auth.error != null) ErrorNotice(message: auth.error!),
        const Divider(),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Notifications'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push('/notifications'),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Privacy'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push('/settings/privacy'),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Terms'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push('/settings/terms'),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Help & Support'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push('/settings/help'),
        ),
        const SizedBox(height: 32),
        OutlinedButton(
          onPressed: auth.busy
              ? null
              : () async {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const Text('Sign out of Pocket Doctor?'),
                      content: const Text(
                        'Your profile is saved. Sign in again with your mobile number whenever you’re ready.',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const Text('Stay here'),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: const Text('Sign out'),
                        ),
                      ],
                    ),
                  );
                  if (confirmed == true) {
                    await ref.read(authProvider.notifier).logout();
                  }
                },
          child: const Text('Sign out'),
        ),
      ],
    );
  }
}

class InformationScreen extends StatelessWidget {
  const InformationScreen({super.key, required this.kind});
  final String kind;
  @override
  Widget build(BuildContext context) {
    final (title, heading, text) = switch (kind) {
      'terms' => (
        'Terms',
        'Using Pocket Doctor responsibly.',
        'Pocket Doctor brings together health education, consultations, curated wellness products and a health companion. Availability depends on the service and configured providers. Demo content and simulated payments are clearly marked.\n\nEducational content and assistant responses do not replace professional medical consultation. No guaranteed health outcome is offered.\n\nApproved terms, cancellation policies and support details must be published before public launch. View current policy versions in Privacy & account. This explanation is not a legal agreement.',
      ),
      _ => (
        'Help & Support',
        'A little help getting started.',
        'Signing in\nUse your Indian mobile number and the latest six-digit verification code. A code expires after five minutes. You can request another after one minute, up to five per hour.\n\nUpdating your details\nOpen Profile → Edit profile to change your name, language or wellness interests.\n\nFinding services\nExplore all four services from Home. Check each service for availability. Manage permissions and account requests in Privacy & account.\n\nSupport contact details must be published before public launch.',
      ),
    };
    return DetailPage(
      title: title,
      children: [
        Text(heading, style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 24),
        Text(text, style: Theme.of(context).textTheme.bodyLarge),
      ],
    );
  }
}
