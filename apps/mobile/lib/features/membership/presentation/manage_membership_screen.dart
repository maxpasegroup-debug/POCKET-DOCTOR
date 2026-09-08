import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/membership_providers.dart';
import '../domain/membership_models.dart';
import 'membership_widgets.dart';

class ManageMembershipScreen extends ConsumerWidget {
  const ManageMembershipScreen({super.key, this.confirmation = false});
  final bool confirmation;
  Future<void> cancel(
    BuildContext context,
    WidgetRef ref,
    MembershipSubscription s,
  ) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel membership?'),
        content: Text(
          'Your benefits remain available until ${s.endDate}. You can continue using your free Pocket Doctor account.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep membership'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Cancel membership'),
          ),
        ],
      ),
    );
    if (yes == true && context.mounted) {
      await ref.read(membershipActionsProvider.notifier).manage(s.id, false);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final action = ref.watch(membershipActionsProvider);
    return Scaffold(
      appBar: AppBar(
        actions: [
          IconButton(
            tooltip: 'Home',
            onPressed: () => context.go('/home'),
            icon: const Icon(Icons.home_outlined),
          ),
        ],
        title: Text(
          confirmation ? 'Membership confirmation' : 'Manage membership',
        ),
      ),
      body: PageBody(
        children: [
          if (action.hasError)
            const ErrorNotice(
              message: 'We couldn’t update your membership. Please try again.',
            ),
          MembershipAsync(
            value: ref.watch(currentMembershipProvider),
            retry: () => ref.invalidate(currentMembershipProvider),
            builder: (current) {
              final s = current.subscription;
              if (s == null) {
                return Column(
                  children: [
                    const Text('You are using a free Pocket Doctor account.'),
                    TextButton(
                      onPressed: () => context.go('/membership'),
                      child: const Text('Explore membership'),
                    ),
                  ],
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (confirmation && current.entitled)
                    const SectionHeading(
                      eyebrow: 'YOUR PERSONAL SPACE',
                      title: 'Your membership is ready.',
                      description:
                          'Your configured benefits are now available.',
                    ),
                  if (s.demo) const StatusPill(label: 'DEMO · NO REAL PAYMENT'),
                  const SizedBox(height: 16),
                  Text(
                    s.name,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  Text('${s.status}${s.trial ? ' · Trial' : ''}'),
                  Text('${membershipMoney(s.price)} / ${s.interval}'),
                  const SizedBox(height: 12),
                  Text(
                    '${current.entitled ? 'Benefits available until' : 'Last period ended'} ${s.endDate}',
                  ),
                  if (s.status == 'CANCELLED')
                    const Text(
                      'Cancellation is scheduled. Your benefits stay available until the date above.',
                    ),
                  MembershipBenefits(current.entitled ? s.benefits : []),
                  const Text(
                    'Manual renewal opens seven days before your period ends. No automatic charge is scheduled.',
                  ),
                  const SizedBox(height: 24),
                  if (['ACTIVE', 'PAST_DUE'].contains(s.status)) ...[
                    ActionButton(
                      label: 'Renew membership',
                      busy: action.isLoading,
                      onPressed: () => context.push(
                        '/membership/checkout/${s.planId}?renew=true',
                      ),
                    ),
                    TextButton(
                      onPressed: action.isLoading
                          ? null
                          : () => cancel(context, ref, s),
                      child: const Text('Cancel membership'),
                    ),
                  ],
                  if (s.status == 'PENDING')
                    TextButton(
                      onPressed: action.isLoading
                          ? null
                          : () => cancel(context, ref, s),
                      child: const Text('Cancel pending checkout'),
                    ),
                  if (s.status == 'CANCELLED' && current.entitled && s.demo)
                    ActionButton(
                      label: 'Reactivate demo membership',
                      busy: action.isLoading,
                      onPressed: () => ref
                          .read(membershipActionsProvider.notifier)
                          .manage(s.id, true),
                    ),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: () => context.go('/membership'),
                    child: const Text('Explore plans'),
                  ),
                  const Text(
                    'To change plans or billing periods, cancel and join your chosen plan after the current period ends. Proration is not available.',
                  ),
                  TextButton(
                    onPressed: () => context.push('/membership/transactions'),
                    child: const Text('View transactions & receipts'),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
