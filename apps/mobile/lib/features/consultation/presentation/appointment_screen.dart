import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/consultation_providers.dart';
import '../domain/consultation_models.dart';
import 'consultation_widgets.dart';

class AppointmentScreen extends ConsumerStatefulWidget {
  const AppointmentScreen({
    super.key,
    required this.id,
    this.confirmation = false,
  });
  final String id;
  final bool confirmation;
  @override
  ConsumerState<AppointmentScreen> createState() => _AppointmentScreenState();
}

class _AppointmentScreenState extends ConsumerState<AppointmentScreen> {
  Timer? timer;
  @override
  void initState() {
    super.initState();
    timer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => ref.invalidate(consultationDetailProvider(widget.id)),
    );
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Keep the mutation controller observed while details refresh or a payment
    // dialog is open; observing it only inside the data branch disposes it.
    final action = ref.watch(consultationActionsProvider);
    return DetailPage(
      title: 'Your appointment',
      onBack: () => consultationBack(context),
      children: [
        ConsultationAsync(
          value: ref.watch(consultationDetailProvider(widget.id)),
          onRetry: () => ref.invalidate(consultationDetailProvider(widget.id)),
          builder: (a) => content(a, action),
        ),
      ],
    );
  }

  Widget content(Appointment a, AsyncValue<void> action) {
    final canChange =
        a.status == 'PENDING_PAYMENT' ||
        (a.status == 'CONFIRMED' &&
            a.startsAt.difference(DateTime.now()).inMinutes >=
                a.cancellationWindowMinutes);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (widget.confirmation && a.status == 'CONFIRMED') ...[
          const Icon(Icons.check_circle_outline, size: 48),
          const SizedBox(height: 16),
          Text(
            a.doctor.isDemo
                ? 'Demo reservation booked'
                : 'Consultation reserved',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 20),
        ],
        StatusPill(label: a.statusLabel),
        const SizedBox(height: 20),
        DoctorCard(doctor: a.doctor, showAction: false, showPrice: false),
        Text(appointmentTime(context, a.startsAt)),
        const SizedBox(height: 8),
        Text(
          '${a.endsAt.difference(a.startsAt).inMinutes} minutes · ${a.price}',
        ),
        const SizedBox(height: 16),
        const Text(providerNotice),
        if (a.doctor.isDemo)
          const Padding(
            padding: EdgeInsets.only(top: 12),
            child: Text('DEMO only. This is not a real doctor appointment.'),
          ),
        if (a.status == 'PENDING_PAYMENT') ...[
          const PageSection('Complete your reservation'),
          Text('Time held until ${appointmentTime(context, a.holdExpiresAt)}.'),
          if (a.paymentStatus == 'FAILED')
            const ErrorNotice(
              message:
                  'Payment could not be completed. You can retry while the time is held.',
            ),
          const SizedBox(height: 16),
          ActionButton(
            label: 'Continue to payment',
            busy: action.isLoading,
            onPressed: () => pay(a),
          ),
        ],
        if (a.status == 'EXPIRED') ...[
          const PageSection('This reservation expired'),
          const Text(
            'No appointment was confirmed. Choose a new time to try again.',
          ),
          TextButton(
            onPressed: () => context.push('/doctors/${a.doctor.id}/book'),
            child: const Text('Choose another time'),
          ),
        ],
        if (a.refundStatus == 'REVIEW_REQUIRED')
          const Padding(
            padding: EdgeInsets.only(top: 20),
            child: Text(
              'Refund review required. No refund has been issued. Contact support for the next step.',
            ),
          ),
        if (canChange) ...[
          const PageSection('Manage your appointment'),
          Text(
            'Changes close ${a.cancellationWindowMinutes} minutes before the start. An unpaid hold can be cancelled until it expires.',
          ),
          Wrap(
            spacing: 12,
            children: [
              OutlinedButton(
                onPressed: action.isLoading
                    ? null
                    : () => context.push(
                        '/doctors/${a.doctor.id}/book?reschedule=${a.id}',
                      ),
                child: const Text('Change time'),
              ),
              TextButton(
                onPressed: action.isLoading ? null : () => cancel(a),
                child: const Text('Cancel reservation'),
              ),
            ],
          ),
        ],
        if (a.note != null) ...[
          const PageSection('Consultation summary'),
          Text(
            a.note!.summary.isEmpty
                ? 'No shared summary was added.'
                : a.note!.summary,
          ),
          if (a.note!.followUpRequired) ...[
            const PageSection('Follow-up'),
            if (a.note!.followUpDate != null)
              Text('Suggested date: ${a.note!.followUpDate}'),
            Text(a.note!.followUpNote),
          ],
        ] else if (a.status == 'COMPLETED') ...[
          const PageSection('Consultation record'),
          const Text('Your doctor has not shared a summary yet.'),
        ],
        if (action.hasError)
          ErrorNotice(message: consultationError(action.error)),
        const SizedBox(height: 24),
        if (widget.confirmation)
          ActionButton(
            label: 'View appointment',
            onPressed: () => context.go('/consultation/${a.id}'),
          ),
        TextButton(
          onPressed: () => context.go('/home'),
          child: const Text('Return Home'),
        ),
        const SizedBox(height: 24),
        const Text(emergencyNotice),
      ],
    );
  }

  Future<void> pay(Appointment a) async {
    final actions = ref.read(consultationActionsProvider.notifier);
    final payment = await actions.payment(a.id);
    if (payment == null || !mounted) return;
    if (payment.mode != 'development') return;
    final capture = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Development payment'),
        content: Text(
          'Simulate ${payment.currency} ${(payment.amountPaise / 100).toStringAsFixed(2)}. No money is charged. This does not book a real consultation.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Simulate failure'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Simulate payment'),
          ),
        ],
      ),
    );
    if (capture == null || !mounted) return;
    final result = await actions.settle(payment.id, capture);
    if (result != null && mounted && result.status == 'CONFIRMED') {
      context.go('/consultation/${result.id}/confirmation');
    }
  }

  Future<void> cancel(Appointment a) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel this reservation?'),
        content: const Text(
          'Your time will be released. Any paid amount will be marked for refund review.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep reservation'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm cancellation'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await ref.read(consultationActionsProvider.notifier).cancel(a.id);
    }
  }
}

class HomeConsultations extends ConsumerWidget {
  const HomeConsultations({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => ConsultationAsync(
    value: ref.watch(myConsultationsProvider),
    onRetry: () => ref.invalidate(myConsultationsProvider),
    builder: (items) {
      final upcoming = items.where((a) => a.upcoming).toList()
        ..sort((a, b) => a.startsAt.compareTo(b.startsAt));
      return upcoming.isEmpty
          ? const SizedBox.shrink()
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const PageSection('Your next conversation'),
                AppointmentCard(appointment: upcoming.first),
              ],
            );
    },
  );
}
