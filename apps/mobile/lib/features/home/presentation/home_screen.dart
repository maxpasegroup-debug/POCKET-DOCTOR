import 'package:flutter/material.dart';
import '../../membership/presentation/membership_widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../../../shared/widgets/service_tile.dart';
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
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$greeting, ${user?.firstName ?? 'there'}',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 6),
                  const Text('Your health, our priority.'),
                ],
              ),
            ),
            IconButton.filledTonal(
              tooltip: 'Your profile',
              onPressed: () => context.go('/profile'),
              icon: const Icon(Icons.person_outline_rounded),
            ),
          ],
        ),
        const SizedBox(height: 20),
        FoundationCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Your Health Journey',
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const CircleAvatar(
                    radius: 28,
                    backgroundColor: AppColors.mint,
                    child: Icon(
                      Icons.favorite_border_rounded,
                      color: AppColors.green,
                      size: 30,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Text(
                      'Your health journey\nstarts here.',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => context.push('/health'),
                child: const Text('Explore My Health'),
              ),
            ],
          ),
        ),
        const PageSection('Care for every part of you'),
        ServiceGrid(
          children: [
            ServiceTile(
              key: const Key('service-programs'),
              title: 'Learn & Transform',
              icon: Icons.school_outlined,
              color: AppColors.green,
              background: AppColors.mint,
              onTap: () => context.go('/programs'),
            ),
            ServiceTile(
              key: const Key('service-consult'),
              title: 'Talk to a Doctor',
              icon: Icons.medical_services_outlined,
              color: AppColors.information,
              background: AppColors.sky,
              onTap: () => context.go('/consult'),
            ),
            ServiceTile(
              key: const Key('service-shop'),
              title: 'Wellness Medicines',
              icon: Icons.spa_outlined,
              color: AppColors.violet,
              background: AppColors.lavender,
              onTap: () => context.push('/wellness'),
            ),
            ServiceTile(
              key: const Key('service-assistant'),
              title: 'AI Health Assistant',
              icon: Icons.smart_toy_outlined,
              color: AppColors.green,
              background: AppColors.mint,
              onTap: () => context.go('/assistant'),
            ),
          ],
        ),
        const SizedBox(height: 20),
        ListTile(
          tileColor: AppColors.sky,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          leading: const Icon(
            Icons.wb_sunny_outlined,
            color: AppColors.information,
          ),
          title: const Text('A moment for you'),
          subtitle: const Text('Check in with yourself today.'),
          trailing: const Icon(Icons.chevron_right_rounded),
          onTap: () => context.push('/assistant/check-ins'),
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
        const MembershipHomeCard(),
      ],
    );
  }
}
