import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config/app_config.dart';
import '../../core/networking/api_client.dart';
import '../auth/application/auth_controller.dart';
import '../auth/domain/auth_models.dart';
import '../consultation/application/consultation_providers.dart';
import 'patient_realtime.dart';

final patientSocketFactoryProvider = Provider<PatientSocketFactory>(
  (ref) => ChannelPatientSocket.new,
);

class PatientRealtimeSession {
  PatientRealtimeSession(this.connection, this.notices);
  final PatientRealtime connection;
  final Stream<DoctorAvailable> notices;
}

final patientRealtimeSessionProvider = Provider<PatientRealtimeSession?>((ref) {
  final (phase, userId) = ref.watch(
    authProvider.select((s) => (s.phase, s.user?.id)),
  );
  final token = ref.read(apiClientProvider).token;
  if (phase != AuthPhase.signedIn || userId == null || token == null) {
    return null;
  }
  final notices = StreamController<DoctorAvailable>.broadcast();
  bool active = true;
  Future<void> refresh([DoctorAvailable? event]) async {
    try {
      ref.invalidate(doctorDiscoveryProvider);
      ref.invalidate(specialtiesProvider);
      await ref.read(doctorDiscoveryProvider.future);
      if (!active || !ref.mounted) return;
      if (event != null) {
        // Filters/pagination may exclude the new Doctor from the current list.
        // Confirm public visibility using the existing authenticated detail API.
        await ref.read(consultationRepositoryProvider).doctor(event.id);
        if (active && ref.mounted) notices.add(event);
      }
    } catch (_) {
      /* REST provider retains its normal error/retry state. */
    }
  }

  final connection = PatientRealtime(
    api: ref.watch(appConfigProvider).apiBaseUri,
    connect: ref.watch(patientSocketFactoryProvider),
    onConnected: () => unawaited(refresh()),
    onDoctorAvailable: (event) => unawaited(refresh(event)),
  );
  ref.onDispose(() {
    active = false;
    connection.dispose();
    unawaited(notices.close());
  });
  Future.microtask(() {
    if (active) connection.start(token);
  });
  return PatientRealtimeSession(connection, notices.stream);
});

final doctorAvailabilityNoticeProvider = StreamProvider<DoctorAvailable>(
  (ref) =>
      ref.watch(patientRealtimeSessionProvider)?.notices ??
      const Stream.empty(),
);
