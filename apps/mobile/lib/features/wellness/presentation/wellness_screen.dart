import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/commerce_providers.dart';
import 'commerce_widgets.dart';

class WellnessScreen extends ConsumerStatefulWidget {
  const WellnessScreen({super.key});
  @override
  ConsumerState<WellnessScreen> createState() => _WellnessScreenState();
}

class _WellnessScreenState extends ConsumerState<WellnessScreen> {
  final search = TextEditingController();
  @override
  void initState() {
    super.initState();
    search.text = ref.read(productFiltersProvider)['q'] ?? '';
  }

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filters = ref.watch(productFiltersProvider);
    final controller = ref.read(productFiltersProvider.notifier);
    return CommercePage(
      title: 'Wellness',
      actions: [
        IconButton(
          tooltip: 'My Cart',
          onPressed: () => context.push('/cart'),
          icon: const Icon(Icons.shopping_bag_outlined),
        ),
      ],
      children: [
        const SectionHeading(
          eyebrow: 'POCKET DOCTOR WELLNESS',
          title: 'A little care,\nevery day.',
          description:
              'Curated wellness products, brought together by Pocket Doctor.',
        ),
        TextField(
          controller: search,
          textInputAction: TextInputAction.search,
          onSubmitted: (v) => controller.set('q', v.trim()),
          decoration: InputDecoration(
            labelText: 'Search wellness products',
            prefixIcon: IconButton(
              tooltip: 'Search',
              onPressed: () => controller.set('q', search.text.trim()),
              icon: const Icon(Icons.search),
            ),
            suffixIcon: IconButton(
              tooltip: 'Clear search',
              onPressed: () {
                search.clear();
                controller.set('q', '');
              },
              icon: const Icon(Icons.close),
            ),
          ),
        ),
        const SizedBox(height: 20),
        CommerceAsync(
          value: ref.watch(wellnessCategoriesProvider),
          retry: () => ref.invalidate(wellnessCategoriesProvider),
          builder: (categories) => SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ChoiceChip(
                  label: const Text('All'),
                  selected: filters['category'] == null,
                  onSelected: (_) => controller.set('category', ''),
                ),
                for (final c in categories)
                  ChoiceChip(
                    label: Text(c.name),
                    selected: filters['category'] == c.id,
                    onSelected: (_) => controller.set('category', c.id),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        ExpansionTile(
          tilePadding: EdgeInsets.zero,
          title: const Text('Filters & sorting'),
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilterChip(
                  label: const Text('Featured'),
                  selected: filters['featured'] == 'true',
                  onSelected: (v) =>
                      controller.set('featured', v ? 'true' : ''),
                ),
                FilterChip(
                  label: const Text('Available now'),
                  selected: filters['available'] == 'true',
                  onSelected: (v) =>
                      controller.set('available', v ? 'true' : ''),
                ),
                FilterChip(
                  label: const Text('Under INR 500'),
                  selected: filters['maxPrice'] != null,
                  onSelected: (v) =>
                      controller.set('maxPrice', v ? '50000' : ''),
                ),
                ChoiceChip(
                  label: const Text('New arrivals'),
                  selected: filters['sort'] != 'price',
                  onSelected: (_) => controller.set('sort', 'newest'),
                ),
                ChoiceChip(
                  label: const Text('Price: low to high'),
                  selected: filters['sort'] == 'price',
                  onSelected: (_) => controller.set('sort', 'price'),
                ),
              ],
            ),
          ],
        ),
        const PageSection('Carefully selected for your routine'),
        CommerceAsync(
          value: ref.watch(productDiscoveryProvider),
          retry: () => ref.invalidate(productDiscoveryProvider),
          builder: (page) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (page.collections.isNotEmpty) ...[
                const Text('Collections'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final collection in page.collections)
                      FilterChip(
                        label: Text(collection),
                        selected: filters['collection'] == collection,
                        onSelected: (v) =>
                            controller.set('collection', v ? collection : ''),
                      ),
                  ],
                ),
                const SizedBox(height: 24),
              ],
              if (page.products.isEmpty)
                const CommerceEmpty(
                  title: 'No products found',
                  message:
                      'Try another search or category. Our curated catalogue will grow thoughtfully.',
                ),
              for (final p in page.products) WellnessProductCard(product: p),
              Wrap(
                spacing: 12,
                children: [
                  if (page.page > 1)
                    OutlinedButton(
                      onPressed: () => controller.page(page.page - 1),
                      child: const Text('Previous'),
                    ),
                  if (page.page * 20 < page.total)
                    OutlinedButton(
                      onPressed: () => controller.page(page.page + 1),
                      child: const Text('More products'),
                    ),
                ],
              ),
            ],
          ),
        ),
        TextButton(
          onPressed: () => context.push('/orders'),
          child: const Text('My Orders'),
        ),
      ],
    );
  }
}
