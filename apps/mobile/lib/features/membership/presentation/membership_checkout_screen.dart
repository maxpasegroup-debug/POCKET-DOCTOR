import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/membership_providers.dart';
import '../domain/membership_models.dart';
import 'membership_widgets.dart';

class MembershipCheckoutScreen extends ConsumerStatefulWidget {
  const MembershipCheckoutScreen({
    super.key,
    required this.id,
    this.renew = false,
  });
  final String id;
  final bool renew;
  @override
  ConsumerState<MembershipCheckoutScreen> createState() => _CheckoutState();
}

class _CheckoutState extends ConsumerState<MembershipCheckoutScreen> {
  final coupon = TextEditingController();
  String code = '';
  MembershipCheckout? checkout;
  bool failed = false;
  @override
  void dispose() {
    coupon.dispose();
    super.dispose();
  }

  Future<void> start({bool trial = false}) async {
    final result = await ref
        .read(membershipActionsProvider.notifier)
        .subscribe(widget.id, code, trial: trial, renew: widget.renew);
    if (!mounted || result == null) return;
    if (result.paymentId == null) {
      context.go('/membership/confirmation');
      return;
    }
    setState(() {
      checkout = result;
      failed = false;
    });
  }

  Future<void> pay(bool capture) async {
    final result = await ref
        .read(membershipActionsProvider.notifier)
        .settle(checkout!.paymentId!, capture);
    if (!mounted || result == null) return;
    if (result) {
      context.go('/membership/confirmation');
    } else {
      setState(() => failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final action = ref.watch(membershipActionsProvider);
    final key = (widget.id, code);
    return Scaffold(
      appBar: AppBar(
        title: Text(checkout == null ? 'Review membership' : 'Demo payment'),
      ),
      body: PageBody(
        children: [
          if (action.hasError)
            ErrorNotice(
              message:
                  'We couldn’t complete that request. Check your membership status or try again.',
            ),
          if (checkout != null) ...[
            const StatusPill(label: 'DEMO ONLY · NO MONEY IS CHARGED'),
            const SizedBox(height: 20),
            Text(
              checkout!.subscription.name,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            Text('Amount: ${membershipMoney(checkout!.amount)}'),
            const SizedBox(height: 20),
            const Text(
              'This simulates a payment provider. Your membership activates only after backend verification.',
            ),
            if (failed) ...[
              const ErrorNotice(
                message:
                    'Payment could not be completed. No membership payment was recorded as successful.',
              ),
              ActionButton(
                label: 'Return to membership',
                onPressed: () => context.go('/membership'),
              ),
            ] else ...[
              const SizedBox(height: 24),
              ActionButton(
                label: 'Simulate successful payment',
                busy: action.isLoading,
                onPressed: () => pay(true),
              ),
              TextButton(
                onPressed: action.isLoading ? null : () => pay(false),
                child: const Text('Simulate failed payment'),
              ),
            ],
          ] else ...[
            MembershipAsync(
              value: ref.watch(membershipQuoteProvider(key)),
              retry: () => ref.invalidate(membershipQuoteProvider(key)),
              builder: (q) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (q.plan.demo) const StatusPill(label: 'DEMO MEMBERSHIP'),
                  const SizedBox(height: 16),
                  Text(
                    q.plan.name,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Regular price: ${membershipMoney(q.plan.price)} / ${q.plan.interval}',
                  ),
                  if (q.discount > 0 && !widget.renew)
                    Text('Offer saving: ${membershipMoney(q.discount)}'),
                  Text(
                    'Due today: ${membershipMoney(widget.renew ? q.renewal : q.amount)}',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  Text(
                    'Renewal price: ${membershipMoney(q.renewal)} / ${q.plan.interval}',
                  ),
                  MembershipBenefits(q.plan.benefits),
                  const Text(
                    'Manual renewal. No automatic debit. Cancel any time; benefits continue until the paid period ends. Taxes and live recurring billing are not configured for this demo.',
                  ),
                  const SizedBox(height: 24),
                  ActionButton(
                    label: widget.renew
                        ? 'Renew membership'
                        : 'Continue to payment',
                    busy: action.isLoading,
                    onPressed: q.plan.demo ? start : null,
                  ),
                  if (q.plan.trialDays > 0 && !widget.renew)
                    TextButton(
                      onPressed: action.isLoading
                          ? null
                          : () => start(trial: true),
                      child: Text(
                        'Start ${q.plan.trialDays}-day trial (if eligible)',
                      ),
                    ),
                  if (!q.plan.demo)
                    const Text(
                      'Production recurring payments remain unconfigured.',
                    ),
                ],
              ),
            ),
            if (!widget.renew) ...[
              const SizedBox(height: 24),
              TextField(
                controller: coupon,
                maxLength: 40,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                  labelText: 'Coupon code (optional)',
                ),
              ),
              OutlinedButton(
                onPressed: action.isLoading
                    ? null
                    : () => setState(
                        () => code = coupon.text.trim().toUpperCase(),
                      ),
                child: const Text('Apply coupon'),
              ),
            ],
          ],
        ],
      ),
    );
  }
}
