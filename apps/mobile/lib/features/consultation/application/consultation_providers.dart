import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/networking/api_client.dart';
import '../../auth/application/auth_controller.dart';
import '../data/consultation_repository.dart';
import '../domain/consultation_models.dart';

final consultationRepositoryProvider = Provider<ConsultationRepository>((ref) {
  ref.watch(currentUserProvider.select((user) => user?.id));
  return ConsultationRepository(ref.watch(apiClientProvider));
});

class DoctorFilters extends Notifier<Map<String, String>> {
  @override
  Map<String, String> build() {
    ref.watch(consultationRepositoryProvider);
    return {};
  }

  void set(String key, String value) {
    final next = {...state}..remove('page');
    value.isEmpty ? next.remove(key) : next[key] = value;
    state = next;
  }

  void page(int value) => state = {...state, 'page': '$value'};
}

final doctorFiltersProvider =
    NotifierProvider<DoctorFilters, Map<String, String>>(DoctorFilters.new);
final doctorDiscoveryProvider = FutureProvider<DoctorPage>(
  (ref) => ref
      .watch(consultationRepositoryProvider)
      .discover(ref.watch(doctorFiltersProvider)),
);
final specialtiesProvider = FutureProvider<List<String>>(
  (ref) => ref.watch(consultationRepositoryProvider).specialties(),
);
final doctorDetailProvider = FutureProvider.autoDispose
    .family<PartnerDoctor, String>(
      (ref, id) => ref.watch(consultationRepositoryProvider).doctor(id),
    );
final doctorSlotsProvider = FutureProvider.autoDispose
    .family<List<AppointmentSlot>, (String, String)>(
      (ref, key) =>
          ref.watch(consultationRepositoryProvider).slots(key.$1, key.$2),
    );
final myConsultationsProvider = FutureProvider<List<Appointment>>(
  (ref) => ref.watch(consultationRepositoryProvider).mine(),
);
final consultationDetailProvider = FutureProvider.autoDispose
    .family<Appointment, String>(
      (ref, id) => ref.watch(consultationRepositoryProvider).detail(id),
    );

class BookingSelection extends Notifier<AppointmentSlot?> {
  BookingSelection((String, String) key);
  @override
  AppointmentSlot? build() {
    ref.watch(consultationRepositoryProvider);
    return null;
  }

  void select(AppointmentSlot? slot) => state = slot;
}

final bookingSelectionProvider = NotifierProvider.autoDispose
    .family<BookingSelection, AppointmentSlot?, (String, String)>(
      BookingSelection.new,
    );

class ConsultationActions extends Notifier<AsyncValue<void>> {
  @override
  AsyncValue<void> build() {
    ref.watch(consultationRepositoryProvider);
    return const AsyncData(null);
  }

  Future<T?> run<T>(
    Future<T> Function(ConsultationRepository) operation,
  ) async {
    if (state.isLoading) return null;
    state = const AsyncLoading();
    try {
      final result = await operation(ref.read(consultationRepositoryProvider));
      if (!ref.mounted) return null;
      state = const AsyncData(null);
      ref.invalidate(myConsultationsProvider);
      ref.invalidate(consultationDetailProvider);
      ref.invalidate(doctorSlotsProvider);
      return result;
    } catch (e, s) {
      if (ref.mounted) state = AsyncError(e, s);
      return null;
    }
  }

  Future<Appointment?> book(
    String doctorId,
    String date,
    AppointmentSlot slot,
  ) => run((r) => r.book(doctorId, date, slot));
  Future<Appointment?> cancel(String id) => run((r) => r.cancel(id));
  Future<Appointment?> reschedule(
    String id,
    String date,
    AppointmentSlot slot,
  ) => run((r) => r.reschedule(id, date, slot));
  Future<ConsultationPayment?> payment(String id) => run((r) => r.payment(id));
  Future<Appointment?> settle(String id, bool capture) =>
      run((r) => r.settle(id, capture));
}

final consultationActionsProvider =
    NotifierProvider.autoDispose<ConsultationActions, AsyncValue<void>>(
      ConsultationActions.new,
    );
