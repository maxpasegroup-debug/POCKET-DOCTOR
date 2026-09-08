import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/membership_providers.dart';

class MembershipAsync<T> extends StatelessWidget {
  const MembershipAsync({
    super.key,
    required this.value,
    required this.retry,
    required this.builder,
  });
  final AsyncValue<T> value;
  final VoidCallback retry;
  final Widget Function(T) builder;
  @override
  Widget build(BuildContext context) => value.when(
    data: builder,
    loading: () => const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: CircularProgressIndicator(),
      ),
    ),
    error: (_, _) => ErrorNotice(
      message: 'We couldn’t load this information. Please try again.',
      onRetry: retry,
    ),
  );
}

class MembershipBenefits extends StatelessWidget {
  const MembershipBenefits(this.items, {super.key});
  final List<String> items;
  @override
  Widget build(BuildContext context) => Column(
    children: [
      for (final label in items)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.check_circle, size: 24, color: AppColors.green),
              const SizedBox(width: 12),
              Expanded(child: Text(label)),
            ],
          ),
        ),
    ],
  );
}

class MembershipHomeCard extends ConsumerWidget {
  const MembershipHomeCard({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(currentMembershipProvider).asData?.value;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: FoundationCard(
        child: Material(
          type: MaterialType.transparency,
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.favorite_outline),
            title: Text(
              current?.entitled == true
                  ? 'Your Pocket Doctor Membership'
                  : 'Explore Pocket Doctor Membership',
            ),
            subtitle: Text(
              current?.entitled == true
                  ? current!.subscription!.name
                  : 'Optional benefits. Your free account stays yours.',
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/membership'),
          ),
        ),
      ),
    );
  }
}

class MembershipUpdates extends ConsumerWidget {
  const MembershipUpdates({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => MembershipAsync(
    value: ref.watch(membershipEventsProvider),
    retry: () => ref.invalidate(membershipEventsProvider),
    builder: (items) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (items.isNotEmpty) const PageSection('Membership updates'),
        for (final item in items.take(5))
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.notifications_none),
            title: Text(switch (item['kind']) {
              'membership_purchased' => 'Membership activated',
              'membership_renewed' => 'Membership renewed',
              'membership_cancelled' => 'Membership cancellation recorded',
              'membership_expired' => 'Membership ended',
              'renewal_approaching' => 'Your membership period ends soon',
              'trial_started' => 'Trial started',
              'trial_converted' => 'Trial converted to paid membership',
              'payment_failed' ||
              'renewal_failed' => 'Payment could not be completed',
              _ => 'Membership activity updated',
            }),
            subtitle: Text((item['createdAt'] as String).substring(0, 10)),
            onTap: () => context.push('/membership/manage'),
          ),
      ],
    ),
  );
}
