import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/networking/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../domain/commerce_models.dart';

String commerceError(Object? e) => e is ApiFailure
    ? e.message
    : 'We could not complete that request. Please try again.';
String statusLabel(String value) => value.toLowerCase().replaceAll('_', ' ');

class CommercePage extends StatelessWidget {
  const CommercePage({
    super.key,
    required this.title,
    required this.children,
    this.actions,
  });
  final String title;
  final List<Widget> children;
  final List<Widget>? actions;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(title),
      actions: actions,
      leading: IconButton(
        tooltip: 'Back',
        icon: const Icon(Icons.arrow_back),
        onPressed: () => context.canPop() ? context.pop() : context.go('/home'),
      ),
    ),
    body: PageBody(children: children),
  );
}

class CommerceAsync<T> extends StatelessWidget {
  const CommerceAsync({
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
    skipLoadingOnRefresh: false,
    loading: () => const Padding(
      padding: EdgeInsets.all(24),
      child: Center(
        child: CircularProgressIndicator(semanticsLabel: 'Loading wellness'),
      ),
    ),
    error: (e, _) => ErrorNotice(message: commerceError(e), onRetry: retry),
    data: builder,
  );
}

class CommerceActionState extends StatelessWidget {
  const CommerceActionState({super.key, required this.value});
  final AsyncValue<void> value;
  @override
  Widget build(BuildContext context) => Column(
    children: [
      if (value.isLoading)
        const LinearProgressIndicator(semanticsLabel: 'Saving your changes'),
      if (value.hasError)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Semantics(
            liveRegion: true,
            child: Text(commerceError(value.error)),
          ),
        ),
    ],
  );
}

class ProductVisual extends StatelessWidget {
  const ProductVisual({super.key, required this.product, this.large = false});
  final WellnessProduct product;
  final bool large;
  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(20),
    child: ColoredBox(
      color: AppColors.mint,
      child: product.images.isEmpty
          ? Padding(padding: const EdgeInsets.all(24), child: _placeholder())
          : AspectRatio(
              aspectRatio: large ? 1.4 : 1.8,
              child: Image.network(
                product.images.first,
                fit: BoxFit.contain,
                semanticLabel: product.name,
                errorBuilder: (_, _, _) => const Icon(
                  Icons.image_not_supported_outlined,
                  semanticLabel: 'Product image unavailable',
                  size: 48,
                ),
              ),
            ),
    ),
  );
  Widget _placeholder() => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.spa_outlined, size: large ? 72 : 48, color: AppColors.navy),
        const SizedBox(height: 12),
        Text(
          product.isDemo
              ? 'DEMO · Image placeholder'
              : 'Product image unavailable',
        ),
      ],
    ),
  );
}

class WellnessProductCard extends StatelessWidget {
  const WellnessProductCard({super.key, required this.product});
  final WellnessProduct product;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 24),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ProductVisual(product: product),
        const SizedBox(height: 16),
        if (product.isDemo) const StatusPill(label: 'DEMO PRODUCT'),
        const SizedBox(height: 8),
        Text(product.name, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text(product.shortDescription),
        const SizedBox(height: 8),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          children: [
            Text(money(product.pricePaise)),
            Text(product.quantityLabel),
            if (product.availableQuantity == 0)
              const Text('Currently unavailable'),
          ],
        ),
        TextButton(
          onPressed: () => context.push('/products/${product.id}'),
          child: const Text('Explore product'),
        ),
      ],
    ),
  );
}

class CommerceEmpty extends StatelessWidget {
  const CommerceEmpty({super.key, required this.title, required this.message});
  final String title, message;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 24),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.spa_outlined, size: 40),
        const SizedBox(height: 16),
        Text(title, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text(message),
      ],
    ),
  );
}

class OrderTotals extends StatelessWidget {
  const OrderTotals({
    super.key,
    required this.subtotal,
    required this.delivery,
    required this.discount,
    required this.total,
  });
  final int subtotal, delivery, discount, total;
  @override
  Widget build(BuildContext context) => FoundationCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Products: ${money(subtotal)}'),
        const SizedBox(height: 8),
        Text('Delivery: ${money(delivery)}'),
        if (discount > 0) Text('Discount: −${money(discount)}'),
        const Divider(height: 24),
        Text(
          'Total: ${money(total)}',
          style: Theme.of(context).textTheme.titleLarge,
        ),
      ],
    ),
  );
}
