import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/networking/api_client.dart';
import '../../auth/application/auth_controller.dart';
import '../data/commerce_repository.dart';
import '../domain/commerce_models.dart';

final commerceRepositoryProvider = Provider<CommerceRepository>((ref) {
  ref.watch(currentUserProvider.select((u) => u?.id));
  return CommerceRepository(ref.watch(apiClientProvider));
});

class ProductFilters extends Notifier<Map<String, String>> {
  @override
  Map<String, String> build() {
    ref.watch(commerceRepositoryProvider);
    return {};
  }

  void set(String key, String value) {
    final next = {...state}..remove('page');
    if (value.isEmpty) {
      next.remove(key);
    } else {
      next[key] = value;
    }
    state = next;
  }

  void page(int page) => state = {...state, 'page': '$page'};
}

final productFiltersProvider =
    NotifierProvider<ProductFilters, Map<String, String>>(ProductFilters.new);
final productDiscoveryProvider = FutureProvider<ProductPage>(
  (ref) => ref
      .watch(commerceRepositoryProvider)
      .discover(ref.watch(productFiltersProvider)),
);
final wellnessCategoriesProvider = FutureProvider<List<WellnessCategory>>(
  (ref) => ref.watch(commerceRepositoryProvider).categories(),
);
final wellnessProductProvider = FutureProvider.autoDispose
    .family<WellnessProduct, String>(
      (ref, id) => ref.watch(commerceRepositoryProvider).product(id),
    );
final wellnessCartProvider = FutureProvider<WellnessCart>(
  (ref) => ref.watch(commerceRepositoryProvider).cart(),
);
final addressesProvider = FutureProvider<List<DeliveryAddress>>(
  (ref) => ref.watch(commerceRepositoryProvider).addresses(),
);
final checkoutQuoteProvider = FutureProvider.autoDispose
    .family<CheckoutQuote, String>(
      (ref, id) => ref.watch(commerceRepositoryProvider).checkout(id),
    );
final wellnessOrdersProvider = FutureProvider.autoDispose
    .family<OrderPage, int>(
      (ref, page) => ref.watch(commerceRepositoryProvider).orders(page),
    );
final wellnessOrderProvider = FutureProvider.autoDispose
    .family<WellnessOrder, String>(
      (ref, id) => ref.watch(commerceRepositoryProvider).order(id),
    );

// Stable within an open checkout, including network retries. The server additionally
// reuses identical pending checkouts if the app restarts and this key is lost.
String checkoutKey() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  final s = bytes.map((v) => v.toRadixString(16).padLeft(2, '0')).join();
  return '${s.substring(0, 8)}-${s.substring(8, 12)}-${s.substring(12, 16)}-${s.substring(16, 20)}-${s.substring(20)}';
}

class CommerceActions extends Notifier<AsyncValue<void>> {
  @override
  AsyncValue<void> build() {
    ref.watch(commerceRepositoryProvider);
    return const AsyncData(null);
  }

  Future<T?> run<T>(Future<T> Function(CommerceRepository) operation) async {
    if (state.isLoading) return null;
    state = const AsyncLoading();
    try {
      final result = await operation(ref.read(commerceRepositoryProvider));
      if (!ref.mounted) return null;
      state = const AsyncData(null);
      ref.invalidate(wellnessCartProvider);
      ref.invalidate(wellnessOrdersProvider);
      ref.invalidate(wellnessOrderProvider);
      ref.invalidate(productDiscoveryProvider);
      ref.invalidate(wellnessProductProvider);
      ref.invalidate(addressesProvider);
      return result;
    } catch (e, s) {
      if (ref.mounted) state = AsyncError(e, s);
      return null;
    }
  }
}

final commerceActionsProvider =
    NotifierProvider.autoDispose<CommerceActions, AsyncValue<void>>(
      CommerceActions.new,
    );
