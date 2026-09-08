import 'package:flutter/material.dart';
import '../../membership/presentation/membership_widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
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
        Text(
          'Health, on your terms.',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 20),
        FoundationCard(
          color: AppColors.sky,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const CircleAvatar(
                    radius: 26,
                    backgroundColor: Colors.white,
                    child: Icon(
                      Icons.person_outline,
                      size: 30,
                      color: AppColors.information,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      user.fullName ?? 'Complete your profile',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                ],
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
        const SizedBox(height: 20),
        FoundationCard(
          child: Column(
            children: [
              for (final item in [
                (
                  title: 'My Health',
                  icon: Icons.favorite_border,
                  route: '/health',
                ),
                (
                  title: 'My Consultations',
                  icon: Icons.medical_services_outlined,
                  route: '/my-consultations',
                ),
                (
                  title: 'My Programs',
                  icon: Icons.auto_stories_outlined,
                  route: '/my-programs',
                ),
                (
                  title: 'My Orders',
                  icon: Icons.shopping_bag_outlined,
                  route: '/orders',
                ),
                (
                  title: 'Membership',
                  icon: Icons.workspace_premium_outlined,
                  route: '/membership',
                ),
                (
                  title: 'Notifications',
                  icon: Icons.notifications_outlined,
                  route: '/notifications',
                ),
                (
                  title: 'Settings',
                  icon: Icons.settings_outlined,
                  route: '/settings',
                ),
                (
                  title: 'Help & Support',
                  icon: Icons.help_outline,
                  route: '/settings/help',
                ),
              ])
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    item.icon,
                    color: AppColors.information,
                    size: 22,
                  ),
                  title: Text(item.title),
                  trailing: const Icon(Icons.chevron_right, size: 18),
                  onTap: () => context.push(item.route),
                ),
            ],
          ),
        ),
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
        const MembershipHomeCard(),
      ],
    );
  }
}
