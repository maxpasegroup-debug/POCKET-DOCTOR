import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/networking/api_client.dart';
import '../../auth/application/auth_controller.dart';
import '../data/assistant_repository.dart';
import '../domain/assistant_models.dart';

final assistantRepositoryProvider = Provider<AssistantRepository>((ref) {
  ref.watch(currentUserProvider.select((u) => u?.id));
  return AssistantRepository(ref.watch(apiClientProvider));
});
final assistantHistoryProvider = FutureProvider.autoDispose
    .family<List<AssistantConversation>, int>(
      (ref, page) => ref.watch(assistantRepositoryProvider).conversations(page),
    );
final assistantChatProvider = FutureProvider.autoDispose
    .family<AssistantConversation, String>(
      (ref, id) => ref.watch(assistantRepositoryProvider).conversation(id),
    );
final assistantRecordsProvider = FutureProvider.autoDispose
    .family<List<WellnessRecord>, (WellnessRecordKind, int)>(
      (ref, key) =>
          ref.watch(assistantRepositoryProvider).records(key.$1, key.$2),
    );
final assistantPreferencesProvider =
    FutureProvider.autoDispose<Map<String, bool>>(
      (ref) => ref.watch(assistantRepositoryProvider).preferences(),
    );
final assistantStatusProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>(
      (ref) =>
          ref.watch(assistantRepositoryProvider).request('GET', '/ai/status'),
    );
final whatsappStatusProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => ref
      .watch(assistantRepositoryProvider)
      .request('GET', '/integrations/whatsapp/link'),
);
final assistantReminderEventsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
      (ref) async =>
          ((await ref
                      .watch(assistantRepositoryProvider)
                      .request('GET', '/ai/reminder-events'))['items']
                  as List)
              .map((v) => Map<String, dynamic>.from(v as Map))
              .toList(),
    );

String assistantRequestKey() {
  final random = Random.secure();
  final bytes = List.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  final s = bytes.map((v) => v.toRadixString(16).padLeft(2, '0')).join();
  return '${s.substring(0, 8)}-${s.substring(8, 12)}-${s.substring(12, 16)}-${s.substring(16, 20)}-${s.substring(20)}';
}

class AssistantActions extends Notifier<AsyncValue<void>> {
  @override
  AsyncValue<void> build() {
    ref.watch(assistantRepositoryProvider);
    return const AsyncData(null);
  }

  Future<T?> run<T>(Future<T> Function(AssistantRepository) work) async {
    if (state.isLoading) return null;
    state = const AsyncLoading();
    try {
      final result = await work(ref.read(assistantRepositoryProvider));
      if (!ref.mounted) return null;
      state = const AsyncData(null);
      ref.invalidate(assistantHistoryProvider);
      ref.invalidate(assistantChatProvider);
      ref.invalidate(assistantRecordsProvider);
      ref.invalidate(assistantPreferencesProvider);
      ref.invalidate(whatsappStatusProvider);
      ref.invalidate(assistantReminderEventsProvider);
      return result;
    } catch (e, s) {
      if (ref.mounted) state = AsyncError(e, s);
      return null;
    }
  }
}

final assistantActionsProvider =
    NotifierProvider.autoDispose<AssistantActions, AsyncValue<void>>(
      AssistantActions.new,
    );
