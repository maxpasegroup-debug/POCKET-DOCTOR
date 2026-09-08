import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../application/commerce_providers.dart';
import '../domain/commerce_models.dart';
import 'commerce_widgets.dart';

class WellnessProductScreen extends ConsumerWidget {
  const WellnessProductScreen({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final action = ref.watch(commerceActionsProvider);
    return CommercePage(
      title: 'Product details',
      children: [
        CommerceActionState(value: action),
        CommerceAsync(
          value: ref.watch(wellnessProductProvider(id)),
          retry: () => ref.invalidate(wellnessProductProvider(id)),
          builder: (p) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ProductVisual(product: p, large: true),
              const SizedBox(height: 24),
              if (p.isDemo) const StatusPill(label: 'DEMO · Not for real sale'),
              if (p.memberPricePaise < p.pricePaise)
                Text(
                  'Your member price: ₹${(p.memberPricePaise / 100).toStringAsFixed(2)}',
                ),
              if (p.membershipRequired)
                TextButton(
                  onPressed: () => context.push('/membership'),
                  child: const Text('Explore membership for this product'),
                ),
              const SizedBox(height: 12),
              Text(p.name, style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 12),
              Text(p.shortDescription),
              const SizedBox(height: 20),
              Text(
                money(p.pricePaise),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              if (p.mrpPaise != null) Text('MRP ${money(p.mrpPaise!)}'),
              Text('${p.quantityLabel} · ${p.brand}'),
              const SizedBox(height: 20),
              Text(
                p.availableQuantity > 0 ? 'Available' : 'Currently unavailable',
              ),
              Text(
                p.isDemo
                    ? 'DEMO only. No real payment or delivery.'
                    : 'Delivery eligibility is checked at checkout.',
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed:
                    action.isLoading ||
                        p.membershipRequired ||
                        p.availableQuantity < 1 ||
                        !p.shippingEligible
                    ? null
                    : () async {
                        final result = await ref
                            .read(commerceActionsProvider.notifier)
                            .run((r) => r.setCart(id, 1));
                        if (context.mounted && result != null) {
                          context.push('/cart');
                        }
                      },
                child: const Text('Add to cart'),
              ),
              const PageSection('A closer look'),
              Text(p.description),
              for (final entry in {
                'Ingredients / materials': p.ingredients,
                'How to use': p.usage,
                'Warnings': p.warnings,
                'Storage': p.storage,
                'Manufacturer': p.manufacturer,
                'Returns policy': p.returnPolicy,
              }.entries) ...[PageSection(entry.key), Text(entry.value)],
              if (p.doctorAssociation != null) ...[
                const PageSection('Pocket Doctor Wellness'),
                Text(p.doctorAssociation!),
              ],
              const SizedBox(height: 20),
              const Text(
                'Product information does not replace personal medical advice. No medical outcome is promised.',
              ),
            ],
          ),
        ),
      ],
    );
  }
}
