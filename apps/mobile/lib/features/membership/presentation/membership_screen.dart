import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/membership_providers.dart';
import '../domain/membership_models.dart';
import 'membership_widgets.dart';

class MembershipScreen extends ConsumerWidget {
  const MembershipScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(
      title: const Text('Pocket Doctor Membership'),
      actions: [
        IconButton(
          tooltip: 'Home',
          onPressed: () => context.go('/home'),
          icon: const Icon(Icons.home_outlined),
        ),
      ],
    ),
    body: PageBody(
      children: [
        const SectionHeading(
          eyebrow: 'YOUR PERSONAL HEALTH SPACE',
          title: 'A little more support.',
          description:
              'Stay connected to your health, wellness and Pocket Doctor support. Membership is always optional.',
        ),
        MembershipAsync(
          value: ref.watch(currentMembershipProvider),
          retry: () => ref.invalidate(currentMembershipProvider),
          builder: (current) {
            final sub = current.subscription;
            return FoundationCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    current.entitled && sub != null
                        ? sub.name
                        : 'Your free account',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    current.entitled && sub != null
                        ? '${sub.status} · Benefits until ${sub.endDate}'
                        : 'Explore programs, doctors, wellness and your assistant.',
                  ),
                  if (sub != null)
                    TextButton(
                      onPressed: () => context.push('/membership/manage'),
                      child: const Text('Manage membership'),
                    ),
                ],
              ),
            );
          },
        ),
        const PageSection('Choose what works for you'),
        MembershipAsync(
          value: ref.watch(membershipPlansProvider),
          retry: () => ref.invalidate(membershipPlansProvider),
          builder: (plans) => Column(
            children: [
              if (plans.isEmpty)
                const Text(
                  'Membership plans are not available yet. Your free account remains available.',
                ),
              for (final plan in plans)
                Padding(
                  padding: const EdgeInsets.only(bottom: 20),
                  child: FoundationCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (plan.demo)
                          const StatusPill(label: 'DEMO PLAN · NO REAL CHARGE'),
                        const SizedBox(height: 12),
                        Text(
                          plan.name,
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        Text(
                          '${membershipMoney(plan.price)} / ${plan.interval}',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 8),
                        Text(plan.description),
                        MembershipBenefits(plan.benefits),
                        ActionButton(
                          label: 'View plan',
                          onPressed: () =>
                              context.push('/membership/plans/${plan.id}'),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
        TextButton(
          onPressed: () => context.push('/membership/transactions'),
          child: const Text('Transactions & receipts'),
        ),
      ],
    ),
  );
}

class MembershipPlanScreen extends ConsumerWidget {
  const MembershipPlanScreen({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(title: const Text('Your membership plan')),
    body: PageBody(
      children: [
        MembershipAsync(
          value: ref.watch(membershipPlansProvider),
          retry: () => ref.invalidate(membershipPlansProvider),
          builder: (plans) {
            final matches = plans.where((p) => p.id == id);
            if (matches.isEmpty) {
              return const Text('This plan is no longer available.');
            }
            final p = matches.first;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (p.demo) const StatusPill(label: 'DEVELOPMENT DEMO'),
                const SizedBox(height: 16),
                Text(p.name, style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 12),
                Text(p.description),
                const SizedBox(height: 16),
                Text(
                  '${membershipMoney(p.price)} / ${p.interval}',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                MembershipBenefits(p.benefits),
                const SizedBox(height: 24),
                const Text(
                  'Manual renewal only. No automatic debit is configured. Cancel at any time; your benefits remain until the current period ends.',
                ),
                if (p.trialDays > 0)
                  Text(
                    '${p.trialDays}-day trial available for eligible accounts. No automatic charge at trial end.',
                  ),
                const SizedBox(height: 24),
                ActionButton(
                  label: 'Review membership',
                  onPressed: () => context.push('/membership/checkout/$id'),
                ),
              ],
            );
          },
        ),
      ],
    ),
  );
}
