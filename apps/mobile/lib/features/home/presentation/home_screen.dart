import 'package:flutter/material.dart';
import '../../membership/presentation/membership_widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../../auth/application/auth_controller.dart';
import '../../programs/presentation/home_programs.dart';
import '../../consultation/presentation/appointment_screen.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final hour = DateTime.now().hour;
    final greeting = hour < 12
        ? 'Good morning'
        : hour < 17
        ? 'Good afternoon'
        : 'Good evening';
    return PageBody(
      children: [
        Text(
          '$greeting, ${user?.firstName ?? 'there'}',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 12),
        Text(
          'Your health journey\nstarts here.',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: 12),
        const Text(
          'A little learning. A little action. A little more care for yourself.',
        ),
        const SizedBox(height: 28),
        FoundationCard(
          color: AppColors.mint,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const StatusPill(label: 'YOUR PERSONAL SPACE'),
              const SizedBox(height: 16),
              Text(
                'A fresh start, at your pace.',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              const Text(
                'Your profile is ready. Explore your programs and learning progress below, at your own pace.',
              ),
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: () => context.push('/health'),
                child: const Text('Explore My Health'),
              ),
            ],
          ),
        ),
        const MembershipHomeCard(),
        const PageSection(
          'Care for every part of you',
          subtitle: 'Four ways to learn, find guidance and feel supported.',
        ),
        PreviewTile(
          key: const Key('service-programs'),
          title: 'Learn & Transform',
          description: 'Doctor-led programs for body and mind.',
          icon: Icons.auto_stories_outlined,
          label: 'LEARN',
          onTap: () => context.go('/programs'),
        ),
        PreviewTile(
          key: const Key('service-consult'),
          title: 'Talk to a Doctor',
          description: 'Professional guidance, when you need it.',
          icon: Icons.medical_services_outlined,
          label: 'CONSULT',
          onTap: () => context.go('/consult'),
        ),
        PreviewTile(
          key: const Key('service-shop'),
          title: 'Wellness',
          description: 'Carefully selected products for your daily routine.',
          icon: Icons.spa_outlined,
          label: 'SUPPORT',
          onTap: () => context.push('/wellness'),
        ),
        PreviewTile(
          key: const Key('service-assistant'),
          title: 'AI Health Assistant',
          description: 'Your companion for everyday wellness and consistency.',
          icon: Icons.chat_bubble_outline,
          label: 'TRACK',
          onTap: () => context.go('/assistant'),
        ),
        const PageSection('Continue your journey'),
        Text(
          user?.interests.isNotEmpty == true
              ? 'Your interests: ${user!.interests.join(' · ')}'
              : 'Tell us what you’re interested in, whenever you’re ready.',
        ),
        TextButton(
          onPressed: () => context.push('/profile/edit'),
          child: const Text('Update my interests'),
        ),
        const HomePrograms(),
        const HomeConsultations(),
      ],
    );
  }
}
