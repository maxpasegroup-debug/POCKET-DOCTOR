import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/networking/api_client.dart';
import '../../auth/application/auth_controller.dart';
import '../../assistant/application/assistant_providers.dart'
    show assistantRequestKey;
import '../data/membership_repository.dart';
import '../domain/membership_models.dart';

final membershipRepositoryProvider = Provider<MembershipRepository>((ref) {
  ref.watch(currentUserProvider.select((v) => v?.id));
  return MembershipRepository(ref.watch(apiClientProvider));
});
final membershipPlansProvider = FutureProvider.autoDispose(
  (ref) => ref.watch(membershipRepositoryProvider).plans(),
);
final currentMembershipProvider = FutureProvider.autoDispose(
  (ref) => ref.watch(membershipRepositoryProvider).current(),
);
final membershipQuoteProvider = FutureProvider.autoDispose
    .family<MembershipQuote, (String, String)>(
      (ref, key) =>
          ref.watch(membershipRepositoryProvider).quote(key.$1, key.$2),
    );
final membershipTransactionsProvider = FutureProvider.autoDispose
    .family<List<Map<String, dynamic>>, int>(
      (ref, page) => ref.watch(membershipRepositoryProvider).transactions(page),
    );
final membershipInvoiceProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>, String>(
      (ref, id) => ref.watch(membershipRepositoryProvider).invoice(id),
    );
final membershipEventsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
      (ref) async =>
          ((await ref
                      .watch(membershipRepositoryProvider)
                      .request('GET', '/membership/events'))['items']
                  as List)
              .map((v) => Map<String, dynamic>.from(v as Map))
              .toList(),
    );
final membershipActionsProvider =
    NotifierProvider.autoDispose<MembershipActions, AsyncValue<void>>(
      MembershipActions.new,
    );

class MembershipActions extends Notifier<AsyncValue<void>> {
  final _keys = <String, String>{};
  @override
  AsyncValue<void> build() {
    ref.watch(membershipRepositoryProvider);
    return const AsyncData(null);
  }

  Future<T?> run<T>(Future<T> Function(MembershipRepository) work) async {
    if (state.isLoading) return null;
    state = const AsyncLoading();
    try {
      final value = await work(ref.read(membershipRepositoryProvider));
      if (ref.mounted) {
        state = const AsyncData(null);
        ref.invalidate(currentMembershipProvider);
        ref.invalidate(membershipTransactionsProvider);
      }
      return value;
    } catch (e, s) {
      if (ref.mounted) state = AsyncError(e, s);
      return null;
    }
  }

  Future<MembershipCheckout?> subscribe(
    String id,
    String code, {
    bool trial = false,
    bool renew = false,
  }) {
    final key = '$id:$code:$trial:$renew';
    return run(
      (r) => r.subscribe(
        id,
        code,
        _keys.putIfAbsent(key, assistantRequestKey),
        trial: trial,
        renew: renew,
      ),
    );
  }

  Future<bool?> settle(String id, bool capture) =>
      run((r) => r.settle(id, capture));
  Future<bool?> manage(String id, bool reactivate) => run((r) async {
    await r.manage(id, reactivate);
    return true;
  });
}
