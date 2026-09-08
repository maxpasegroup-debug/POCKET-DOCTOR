import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../application/commerce_providers.dart';
import '../domain/commerce_models.dart';
import 'commerce_widgets.dart';

class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});
  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  int page = 1;
  @override
  Widget build(BuildContext context) => CommercePage(
    title: 'My Orders',
    children: [
      CommerceAsync(
        value: ref.watch(wellnessOrdersProvider(page)),
        retry: () => ref.invalidate(wellnessOrdersProvider(page)),
        builder: (result) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (result.orders.isEmpty)
              const CommerceEmpty(
                title: 'No orders yet',
                message: 'Your wellness purchases will appear here.',
              ),
            for (final order in result.orders)
              Padding(
                padding: const EdgeInsets.only(bottom: 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    StatusPill(label: statusLabel(order.status)),
                    const SizedBox(height: 12),
                    Text(
                      order.items.map((i) => i.name).join(' · '),
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${MaterialLocalizations.of(context).formatMediumDate(order.createdAt.toLocal())} · ${money(order.totalPaise)}',
                    ),
                    Text(order.number),
                    if (order.isDemo) const Text('DEMO order'),
                    TextButton(
                      onPressed: () => context.push('/orders/${order.id}'),
                      child: const Text('View order'),
                    ),
                    const Divider(),
                  ],
                ),
              ),
            Wrap(
              spacing: 12,
              children: [
                if (page > 1)
                  OutlinedButton(
                    onPressed: () => setState(() => page--),
                    child: const Text('Previous'),
                  ),
                if (page * 20 < result.total)
                  OutlinedButton(
                    onPressed: () => setState(() => page++),
                    child: const Text('More orders'),
                  ),
              ],
            ),
            TextButton(
              onPressed: () => context.go('/wellness'),
              child: const Text('Explore Wellness'),
            ),
          ],
        ),
      ),
    ],
  );
}

class WellnessOrderScreen extends ConsumerStatefulWidget {
  const WellnessOrderScreen({super.key, required this.id});
  final String id;
  @override
  ConsumerState<WellnessOrderScreen> createState() =>
      _WellnessOrderScreenState();
}

class _WellnessOrderScreenState extends ConsumerState<WellnessOrderScreen> {
  Timer? timer;
  @override
  void initState() {
    super.initState();
    timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) ref.invalidate(wellnessOrderProvider(widget.id));
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> pay() async {
    final controller = ref.read(commerceActionsProvider.notifier);
    final payment = await controller.run((r) => r.payment(widget.id));
    if (!mounted || payment == null) return;
    if (payment.mode != 'development') return;
    final capture = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Demo payment'),
        content: Text(
          'Simulate ${money(payment.amountPaise)}. No real money will move and no products will ship.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Simulate failure'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Simulate payment'),
          ),
        ],
      ),
    );
    if (capture != null && mounted) {
      await controller.run((r) => r.settle(payment.id, capture));
    }
  }

  @override
  Widget build(BuildContext context) {
    // Keep action state observed while detail reloads or a payment dialog is open.
    final action = ref.watch(commerceActionsProvider);
    return CommercePage(
      title: 'Your order',
      children: [
        CommerceActionState(value: action),
        CommerceAsync(
          value: ref.watch(wellnessOrderProvider(widget.id)),
          retry: () => ref.invalidate(wellnessOrderProvider(widget.id)),
          builder: (order) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (order.confirmed) ...[
                const Icon(Icons.check_circle_outline, size: 48),
                const SizedBox(height: 16),
                Text(
                  order.isDemo ? 'Demo order confirmed' : 'Order confirmed',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
              ],
              const SizedBox(height: 12),
              StatusPill(label: statusLabel(order.status)),
              const SizedBox(height: 16),
              SelectableText(order.number),
              if (order.isDemo)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Text('DEMO only · No real payment or shipment.'),
                ),
              const PageSection('Your items'),
              for (final item in order.items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${item.name} × ${item.quantity}',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      Text(
                        '${money(item.unitPricePaise)} each · SKU ${item.sku}',
                      ),
                      Text(item.returnPolicy),
                    ],
                  ),
                ),
              OrderTotals(
                subtotal: order.subtotalPaise,
                delivery: order.deliveryPaise,
                discount: order.discountPaise,
                total: order.totalPaise,
              ),
              const PageSection('Delivery address'),
              Text(order.address.summary),
              const SizedBox(height: 12),
              Text(order.deliveryInformation),
              if (order.status == 'PENDING_PAYMENT') ...[
                const PageSection('Complete your payment'),
                Text(
                  'Stock is held until ${MaterialLocalizations.of(context).formatTimeOfDay(TimeOfDay.fromDateTime(order.holdExpiresAt.toLocal()))} (your time).',
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: action.isLoading ? null : pay,
                  child: const Text('Continue to payment'),
                ),
              ],
              if (['PAYMENT_FAILED', 'EXPIRED'].contains(order.status)) ...[
                const PageSection('Let’s try again'),
                const Text(
                  'Your stock reservation was released. Return to your cart to review availability and start a new checkout.',
                ),
                TextButton(
                  onPressed: () => context.go('/cart'),
                  child: const Text('Return to cart'),
                ),
              ],
              const PageSection('Order tracking'),
              for (final event in order.events)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.check_circle_outline, size: 20),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          '${statusLabel(event.status)} · ${MaterialLocalizations.of(context).formatMediumDate(event.at.toLocal())}',
                        ),
                      ),
                    ],
                  ),
                ),
              if (order.trackingNumber != null)
                Text('${order.carrier}: ${order.trackingNumber}'),
              if (order.refundStatus != 'NOT_REQUIRED') ...[
                const PageSection('Refund status'),
                Text(statusLabel(order.refundStatus)),
                const Text(
                  'A request is recorded. Refund completion depends on the payment provider; it is not confirmed here.',
                ),
              ],
              if (order.cancellable)
                OutlinedButton(
                  onPressed: action.isLoading
                      ? null
                      : () async {
                          final yes = await showDialog<bool>(
                            context: context,
                            builder: (c) => AlertDialog(
                              title: const Text('Cancel this order?'),
                              content: const Text(
                                'Reserved stock will be released. A paid order will record a refund request.',
                              ),
                              actions: [
                                TextButton(
                                  onPressed: () => Navigator.pop(c, false),
                                  child: const Text('Keep order'),
                                ),
                                FilledButton(
                                  onPressed: () => Navigator.pop(c, true),
                                  child: const Text('Cancel order'),
                                ),
                              ],
                            ),
                          );
                          if (yes == true && mounted) {
                            await ref
                                .read(commerceActionsProvider.notifier)
                                .run((r) => r.cancel(widget.id));
                          }
                        },
                  child: const Text('Cancel order'),
                ),
              TextButton(
                onPressed: () => context.go('/orders'),
                child: const Text('My Orders'),
              ),
              TextButton(
                onPressed: () => context.go('/wellness'),
                child: const Text('Continue shopping'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
