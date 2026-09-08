import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/networking/api_client.dart';
import '../../auth/application/auth_controller.dart';
import '../data/privacy_repository.dart';

final privacyRepositoryProvider = Provider<PrivacyRepository>((ref) {
  ref.watch(currentUserProvider.select((v) => v?.id));
  return PrivacyRepository(ref.watch(apiClientProvider));
});
final privacyProvider = FutureProvider.autoDispose(
  (ref) => ref.watch(privacyRepositoryProvider).privacy(),
);
final notificationInboxProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>, int>(
      (ref, page) => ref.watch(privacyRepositoryProvider).notifications(page),
    );
final privacyExportProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>, (String, int)>(
      (ref, key) => ref.watch(privacyRepositoryProvider).export(key.$1, key.$2),
    );
final privacyActionsProvider =
    NotifierProvider.autoDispose<PrivacyActions, AsyncValue<void>>(
      PrivacyActions.new,
    );

class PrivacyActions extends Notifier<AsyncValue<void>> {
  @override
  AsyncValue<void> build() => const AsyncData(null);
  Future<void> consent(String type, bool value) async {
    if (state.isLoading) return;
    state = const AsyncLoading();
    final result = await AsyncValue.guard(
      () => ref.read(privacyRepositoryProvider).consent(type, value),
    );
    if (!ref.mounted) return;
    state = result;
    if (!state.hasError) ref.invalidate(privacyProvider);
  }

  Future<void> deleteAccess() async {
    if (state.isLoading) return;
    state = const AsyncLoading();
    final result = await AsyncValue.guard(
      () => ref.read(privacyRepositoryProvider).deleteAccess(),
    );
    if (!ref.mounted) return;
    state = result;
    if (!result.hasError) await ref.read(authProvider.notifier).expireSession();
  }
}
