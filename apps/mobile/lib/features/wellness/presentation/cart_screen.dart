import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../application/commerce_providers.dart';
import '../domain/commerce_models.dart';
import 'commerce_widgets.dart';

class WellnessCartScreen extends ConsumerWidget {
  const WellnessCartScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final action = ref.watch(commerceActionsProvider);
    final controller = ref.read(commerceActionsProvider.notifier);
    return CommercePage(
      title: 'My Cart',
      children: [
        CommerceActionState(value: action),
        CommerceAsync(
          value: ref.watch(wellnessCartProvider),
          retry: () => ref.invalidate(wellnessCartProvider),
          builder: (cart) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (cart.items.isEmpty)
                const CommerceEmpty(
                  title: 'Your cart is empty',
                  message:
                      'Explore a few carefully selected essentials for your routine.',
                ),
              for (final item in cart.items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.product?.name ?? 'Product no longer available',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 8),
                      Text('${money(item.unitPricePaise)} each'),
                      if (item.priceChanged)
                        const Text(
                          'Price updated. Please review the current price before checkout.',
                        ),
                      if (!item.available)
                        const Text(
                          'Availability changed. Reduce the quantity or remove this item.',
                        ),
                      Wrap(
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: 12,
                        children: [
                          IconButton(
                            tooltip: 'Decrease quantity',
                            onPressed: action.isLoading || item.quantity <= 1
                                ? null
                                : () => controller.run(
                                    (r) => r.setCart(
                                      item.productId,
                                      item.quantity - 1,
                                    ),
                                  ),
                            icon: const Icon(Icons.remove),
                          ),
                          Text('Quantity ${item.quantity}'),
                          IconButton(
                            tooltip: 'Increase quantity',
                            onPressed:
                                action.isLoading ||
                                    item.quantity >= 10 ||
                                    item.product == null ||
                                    item.quantity >=
                                        item.product!.availableQuantity
                                ? null
                                : () => controller.run(
                                    (r) => r.setCart(
                                      item.productId,
                                      item.quantity + 1,
                                    ),
                                  ),
                            icon: const Icon(Icons.add),
                          ),
                          TextButton(
                            onPressed: action.isLoading
                                ? null
                                : () => controller.run(
                                    (r) => r.removeCart(item.id),
                                  ),
                            child: const Text('Remove'),
                          ),
                        ],
                      ),
                      const Divider(),
                    ],
                  ),
                ),
              if (cart.items.isNotEmpty) ...[
                Text(
                  'Subtotal: ${money(cart.subtotalPaise)}',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                const Text(
                  'Delivery and the final total are calculated at checkout. Stock is reserved when you place the order.',
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: cart.canCheckout && !action.isLoading
                      ? () => context.push('/checkout')
                      : null,
                  child: const Text('Continue to checkout'),
                ),
              ],
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
