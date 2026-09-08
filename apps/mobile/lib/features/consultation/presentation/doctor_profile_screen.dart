import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/consultation_providers.dart';
import 'consultation_widgets.dart';

class DoctorProfileScreen extends ConsumerWidget {
  const DoctorProfileScreen({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context, WidgetRef ref) => DetailPage(
    title: 'Your doctor',
    onBack: () => consultationBack(context),
    children: [
      ConsultationAsync(
        value: ref.watch(doctorDetailProvider(id)),
        onRetry: () => ref.invalidate(doctorDetailProvider(id)),
        builder: (doctor) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            DoctorCard(doctor: doctor, showAction: false),
            const PageSection('A little about your doctor'),
            Text(doctor.biography),
            const PageSection('Plan your conversation'),
            Text('${doctor.minutes} minutes · ${doctor.price}'),
            const SizedBox(height: 12),
            const Text(providerNotice),
            const SizedBox(height: 24),
            ActionButton(
              label: 'Choose date & time',
              onPressed: () => context.push('/doctors/$id/book'),
            ),
            const SizedBox(height: 24),
            const Text(emergencyNotice),
          ],
        ),
      ),
    ],
  );
}
