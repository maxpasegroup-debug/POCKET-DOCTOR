import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/networking/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../domain/consultation_models.dart';

const emergencyNotice =
    'Pocket Doctor is not an emergency service. If you are experiencing a medical emergency, contact your local emergency service or seek immediate in-person medical care.';
const providerNotice =
    'Booking is available as a reservation. Video, audio and chat connections are not enabled yet. No live medical consultation takes place in this version.';
String consultationError(Object? error) => error is ApiFailure
    ? error.message
    : 'We could not complete that request. Please try again.';
String dateKey(DateTime date) =>
    '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
String appointmentTime(BuildContext context, DateTime time) {
  final local = time.toLocal();
  return '${MaterialLocalizations.of(context).formatMediumDate(local)} · ${MaterialLocalizations.of(context).formatTimeOfDay(TimeOfDay.fromDateTime(local))} (${local.timeZoneName}, your time)';
}

void consultationBack(BuildContext context) =>
    context.canPop() ? context.pop() : context.go('/consult');

class ConsultationAsync<T> extends StatelessWidget {
  const ConsultationAsync({
    super.key,
    required this.value,
    required this.onRetry,
    required this.builder,
  });
  final AsyncValue<T> value;
  final VoidCallback onRetry;
  final Widget Function(T) builder;
  @override
  Widget build(BuildContext context) => value.when(
    skipLoadingOnRefresh: false,
    data: builder,
    loading: () => const Padding(
      padding: EdgeInsets.all(24),
      child: Center(
        child: CircularProgressIndicator(
          semanticsLabel: 'Loading consultations',
        ),
      ),
    ),
    error: (error, _) =>
        ErrorNotice(message: consultationError(error), onRetry: onRetry),
  );
}

class DoctorCard extends StatelessWidget {
  const DoctorCard({
    super.key,
    required this.doctor,
    this.showAction = true,
    this.showPrice = true,
  });
  final PartnerDoctor doctor;
  final bool showAction;
  final bool showPrice;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: FoundationCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: AppColors.mint,
                child: doctor.photoUrl == null
                    ? const Icon(
                        Icons.person_outline,
                        size: 32,
                        color: AppColors.navy,
                      )
                    : ClipOval(
                        child: Image.network(
                          doctor.photoUrl!,
                          width: 56,
                          height: 56,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) =>
                              const Icon(Icons.person_outline),
                        ),
                      ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      doctor.name,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 6),
                    Text(doctor.specialty),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          StatusPill(
            label: doctor.isDemo
                ? 'DEMO · Not a real doctor'
                : doctor.verified
                ? 'Verified partner'
                : 'Verification pending',
          ),
          const SizedBox(height: 12),
          Text(doctor.qualification),
          if (doctor.experienceYears != null)
            Text('${doctor.experienceYears} years of experience'),
          const SizedBox(height: 8),
          Text(doctor.languages.join(' · ')),
          const SizedBox(height: 12),
          if (showPrice) Text('${doctor.minutes} min · ${doctor.price}'),
          if (showAction)
            TextButton(
              onPressed: () => context.push('/doctors/${doctor.id}'),
              child: const Text('View doctor & availability'),
            ),
        ],
      ),
    ),
  );
}

class AppointmentCard extends StatelessWidget {
  const AppointmentCard({super.key, required this.appointment});
  final Appointment appointment;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: FoundationCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          StatusPill(label: appointment.statusLabel),
          const SizedBox(height: 12),
          Text(
            appointment.doctor.name,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(appointmentTime(context, appointment.startsAt)),
          const Text('Connection not enabled yet'),
          TextButton(
            onPressed: () => context.push('/consultation/${appointment.id}'),
            child: const Text('View appointment'),
          ),
        ],
      ),
    ),
  );
}
