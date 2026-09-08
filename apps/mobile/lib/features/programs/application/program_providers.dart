import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/networking/api_client.dart';
import '../../auth/application/auth_controller.dart';
import '../data/program_repository.dart';
import '../domain/program_models.dart';

final programRepositoryProvider = Provider<ProgramRepository>((ref) {
  ref.watch(currentUserProvider.select((user) => user?.id));
  return ProgramRepository(ref.watch(apiClientProvider));
});

class ProgramFilters extends Notifier<Map<String, String>> {
  @override
  Map<String, String> build() {
    ref.watch(currentUserProvider.select((user) => user?.id));
    return {};
  }

  void set(String key, String value) {
    final next = {...state}..remove('page');
    value.isEmpty ? next.remove(key) : next[key] = value;
    state = next;
  }

  void page(int page) => state = {...state, 'page': '$page'};
  void clear() => state = {};
}

final programFiltersProvider =
    NotifierProvider<ProgramFilters, Map<String, String>>(ProgramFilters.new);
final programDiscoveryProvider = FutureProvider<ProgramPage>(
  (ref) => ref
      .watch(programRepositoryProvider)
      .discover(ref.watch(programFiltersProvider)),
);
final programCategoriesProvider = FutureProvider<List<ProgramCategory>>(
  (ref) => ref.watch(programRepositoryProvider).categories(),
);
final programDetailProvider = FutureProvider.autoDispose
    .family<Program, String>(
      (ref, id) => ref.watch(programRepositoryProvider).detail(id),
    );
final myProgramsProvider = FutureProvider<List<ProgramOverview>>(
  (ref) => ref.watch(programRepositoryProvider).mine(),
);
final programOverviewProvider = FutureProvider.autoDispose
    .family<ProgramOverview, String>(
      (ref, id) => ref.watch(programRepositoryProvider).overview(id),
    );
final programLessonProvider = FutureProvider.autoDispose
    .family<ProgramLesson, (String, String)>(
      (ref, ids) => ref.watch(programRepositoryProvider).lesson(ids.$1, ids.$2),
    );
final recommendedProgramsProvider = FutureProvider<List<Program>>((ref) {
  ref.watch(currentUserProvider.select((user) => user?.interests));
  return ref
      .watch(programRepositoryProvider)
      .discover({'recommended': 'true'})
      .then((page) => page.programs);
});

class ProgramActions extends Notifier<AsyncValue<void>> {
  @override
  AsyncValue<void> build() {
    ref.watch(programRepositoryProvider);
    return const AsyncData(null);
  }

  void refresh(String id) {
    ref.invalidate(programDetailProvider(id));
    ref.invalidate(programOverviewProvider(id));
    ref.invalidate(myProgramsProvider);
    ref.invalidate(programDiscoveryProvider);
    ref.invalidate(recommendedProgramsProvider);
  }

  Future<bool> enroll(String id) async {
    state = const AsyncLoading();
    final result = await AsyncValue.guard(
      () => ref.read(programRepositoryProvider).enroll(id),
    );
    if (!ref.mounted) return false;
    state = result;
    if (!result.hasError) refresh(id);
    return !result.hasError;
  }

  Future<ProgramPayment?> payment(String id) async {
    state = const AsyncLoading();
    try {
      final result = await ref.read(programRepositoryProvider).payment(id);
      if (ref.mounted) state = const AsyncData(null);
      return result;
    } catch (e, s) {
      if (ref.mounted) state = AsyncError(e, s);
      return null;
    }
  }

  Future<bool> settle(String programId, String paymentId, bool capture) async {
    state = const AsyncLoading();
    try {
      final verified = await ref
          .read(programRepositoryProvider)
          .settle(paymentId, capture);
      if (!ref.mounted) return false;
      if (!verified) {
        throw const ApiFailure(
          'Payment could not be completed. Please try again.',
        );
      }
      state = const AsyncData(null);
      refresh(programId);
      return true;
    } catch (e, s) {
      if (ref.mounted) state = AsyncError(e, s);
      return false;
    }
  }
}

final programActionsProvider =
    NotifierProvider.autoDispose<ProgramActions, AsyncValue<void>>(
      ProgramActions.new,
    );
