import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/commerce_providers.dart';
import 'commerce_widgets.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});
  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  String? selected;
  String? lastQuote;
  String key = checkoutKey();
  @override
  Widget build(BuildContext context) {
    final action = ref.watch(commerceActionsProvider);
    return CommercePage(
      title: 'Checkout',
      children: [
        const Text(
          'Review your products, delivery address and final total before placing an order.',
        ),
        const PageSection('Shipping address'),
        CommerceAsync(
          value: ref.watch(addressesProvider),
          retry: () => ref.invalidate(addressesProvider),
          builder: (addresses) {
            final id = addresses.any((a) => a.id == selected)
                ? selected
                : addresses.firstOrNull?.id;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (addresses.isEmpty)
                  const CommerceEmpty(
                    title: 'Add a delivery address',
                    message:
                        'A delivery address is needed before we can calculate your final total.',
                  ),
                for (final a in addresses)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: OutlinedButton(
                      onPressed: action.isLoading
                          ? null
                          : () => setState(() => selected = a.id),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(
                              id == a.id
                                  ? Icons.radio_button_checked
                                  : Icons.radio_button_off,
                            ),
                            const SizedBox(width: 12),
                            Expanded(child: Text(a.summary)),
                          ],
                        ),
                      ),
                    ),
                  ),
                TextButton(
                  onPressed: action.isLoading
                      ? null
                      : () => context.push('/addresses'),
                  child: const Text('Manage addresses'),
                ),
                if (id != null)
                  CommerceAsync(
                    value: ref.watch(checkoutQuoteProvider(id)),
                    retry: () {
                      ref.invalidate(checkoutQuoteProvider(id));
                      ref.invalidate(wellnessCartProvider);
                    },
                    builder: (quote) {
                      if (lastQuote != quote.quote) {
                        lastQuote = quote.quote;
                        key = checkoutKey();
                      }
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const PageSection('Order summary'),
                          for (final item in quote.cart.items)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: Text(
                                '${item.product!.name} × ${item.quantity}',
                              ),
                            ),
                          OrderTotals(
                            subtotal: quote.cart.subtotalPaise,
                            delivery: quote.deliveryPaise,
                            discount: quote.discountPaise,
                            total: quote.totalPaise,
                          ),
                          const SizedBox(height: 20),
                          Text(quote.deliveryInformation),
                          if (quote.isDemo)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 16),
                              child: Text(
                                'DEMO CHECKOUT · This is a test purchase. No money will be charged and no goods will be shipped.',
                              ),
                            ),
                          CommerceActionState(value: action),
                          FilledButton(
                            onPressed: action.isLoading
                                ? null
                                : () async {
                                    final order = await ref
                                        .read(commerceActionsProvider.notifier)
                                        .run(
                                          (r) => r.createOrder(
                                            id,
                                            quote.quote,
                                            key,
                                          ),
                                        );
                                    if (context.mounted && order != null) {
                                      context.go('/orders/${order.id}');
                                    }
                                  },
                            child: const Text('Place order'),
                          ),
                          TextButton(
                            onPressed: action.isLoading
                                ? null
                                : () =>
                                      ref.invalidate(checkoutQuoteProvider(id)),
                            child: const Text('Refresh checkout'),
                          ),
                        ],
                      );
                    },
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}
