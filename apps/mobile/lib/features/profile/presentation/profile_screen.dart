import 'package:flutter/material.dart';
import '../../membership/presentation/membership_widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../../auth/application/auth_controller.dart';
import '../domain/user_profile.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final auth = ref.watch(authProvider);
    if (user == null) {
      return const Center(child: CircularProgressIndicator());
    }
    return PageBody(
      children: [
        if (auth.busy) const LinearProgressIndicator(),
        if (auth.error != null)
          ErrorNotice(
            message: auth.error!,
            onRetry: ref.read(authProvider.notifier).revalidateSession,
          ),
        const SectionHeading(
          eyebrow: 'Your space',
          title: 'Health, on your terms.',
          description: 'Your profile and preferences, all in one place.',
        ),
        FoundationCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.person_outline, size: 40),
              const SizedBox(height: 16),
              Text(
                user.fullName ?? 'Complete your profile',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              SelectableText(user.phone),
              const SizedBox(height: 12),
              Text(
                'Preferred language: ${supportedLanguages[user.language] ?? user.language}',
              ),
              const SizedBox(height: 20),
              OutlinedButton(
                onPressed: () => context.push('/profile/edit'),
                child: const Text('Edit profile'),
              ),
            ],
          ),
        ),
        const MembershipHomeCard(),
        const PageSection('Wellness interests'),
        if (user.interests.isEmpty)
          const Text(
            'No interests selected. You can add or remove these anytime.',
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final interest in user.interests)
                Chip(label: Text(interest)),
            ],
          ),
        const SizedBox(height: 24),
        PreviewTile(
          title: 'My Orders',
          description: 'Your wellness purchases and delivery updates.',
          icon: Icons.shopping_bag_outlined,
          label: '',
          onTap: () => context.push('/orders'),
        ),
        PreviewTile(
          title: 'My Health',
          description: 'Your interests and future health journey.',
          icon: Icons.favorite_border,
          label: '',
          onTap: () => context.push('/health'),
        ),
        PreviewTile(
          title: 'Notifications',
          description: 'Reminders and updates, when they arrive.',
          icon: Icons.notifications_outlined,
          label: '',
          onTap: () => context.push('/notifications'),
        ),
        PreviewTile(
          title: 'Settings',
          description: 'Preferences, privacy and account options.',
          icon: Icons.settings_outlined,
          label: '',
          onTap: () => context.push('/settings'),
        ),
      ],
    );
  }
}
