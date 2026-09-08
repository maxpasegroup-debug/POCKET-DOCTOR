import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/consultation_providers.dart';
import '../domain/consultation_models.dart';
import 'consultation_widgets.dart';

class BookingScreen extends ConsumerStatefulWidget {
  const BookingScreen({super.key, required this.doctorId, this.rescheduleId});
  final String doctorId;
  final String? rescheduleId;
  @override
  ConsumerState<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends ConsumerState<BookingScreen> {
  DateTime date = DateUtils.dateOnly(
    DateTime.now().add(const Duration(days: 1)),
  );
  bool review = false;
  @override
  Widget build(BuildContext context) {
    final selected = ref.watch(
      bookingSelectionProvider((widget.doctorId, dateKey(date))),
    );
    final actions = ref.watch(consultationActionsProvider);
    final key = (widget.doctorId, dateKey(date));
    return DetailPage(
      title: review ? 'Review your reservation' : 'Choose a time',
      onBack: () {
        if (review) {
          setState(() => review = false);
        } else {
          consultationBack(context);
        }
      },
      children: [
        ConsultationAsync(
          value: ref.watch(doctorDetailProvider(widget.doctorId)),
          onRetry: () => ref.invalidate(doctorDetailProvider(widget.doctorId)),
          builder: (doctor) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DoctorCard(
                doctor: doctor,
                showAction: false,
                showPrice: widget.rescheduleId == null,
              ),
              if (!review) ...[
                Text(
                  'Choose a calendar date in ${doctor.timezone}. Slot times below are displayed in your device timezone.',
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  icon: const Icon(Icons.calendar_month_outlined),
                  label: Text(
                    MaterialLocalizations.of(context).formatFullDate(date),
                  ),
                  onPressed: () async {
                    final chosen = await showDatePicker(
                      context: context,
                      initialDate: date,
                      firstDate: DateUtils.dateOnly(DateTime.now()),
                      lastDate: DateTime.now().add(const Duration(days: 30)),
                    );
                    if (chosen != null && mounted) {
                      ref
                          .read(bookingSelectionProvider(key).notifier)
                          .select(null);
                      setState(() => date = chosen);
                    }
                  },
                ),
                const PageSection('Available times'),
                ConsultationAsync(
                  value: ref.watch(doctorSlotsProvider(key)),
                  onRetry: () => ref.invalidate(doctorSlotsProvider(key)),
                  builder: (slots) => Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (slots.isEmpty)
                        const Text(
                          'No available times on this date. Please choose another day.',
                        ),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final slot in slots)
                            ChoiceChip(
                              label: Text(
                                appointmentTime(context, slot.startsAt),
                              ),
                              selected: selected?.startsAt == slot.startsAt,
                              onSelected: (_) => ref
                                  .read(bookingSelectionProvider(key).notifier)
                                  .select(slot),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                ActionButton(
                  label: 'Review reservation',
                  onPressed: selected == null
                      ? null
                      : () => setState(() => review = true),
                ),
              ] else if (selected != null) ...[
                Text(appointmentTime(context, selected.startsAt)),
                const SizedBox(height: 12),
                Text(
                  widget.rescheduleId == null
                      ? '${doctor.minutes} minutes · ${doctor.price}'
                      : 'Your original reservation fee stays unchanged.',
                ),
                const SizedBox(height: 12),
                const Text(providerNotice),
                if (doctor.isDemo)
                  const Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: Text(
                      'DEMO reservation only. No real doctor, charge or medical consultation.',
                    ),
                  ),
                const SizedBox(height: 24),
                ActionButton(
                  label: widget.rescheduleId == null
                      ? 'Reserve this time'
                      : 'Confirm new time',
                  busy: actions.isLoading,
                  onPressed: () => submit(selected),
                ),
              ],
              if (actions.hasError)
                ErrorNotice(
                  message: consultationError(actions.error),
                  onRetry: review && selected != null
                      ? () => submit(selected)
                      : null,
                ),
              const SizedBox(height: 24),
              const Text(emergencyNotice),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> submit(AppointmentSlot slot) async {
    final controller = ref.read(consultationActionsProvider.notifier);
    final appointment = widget.rescheduleId == null
        ? await controller.book(widget.doctorId, dateKey(date), slot)
        : await controller.reschedule(
            widget.rescheduleId!,
            dateKey(date),
            slot,
          );
    if (appointment != null && mounted) {
      ref
          .read(
            bookingSelectionProvider((widget.doctorId, dateKey(date))).notifier,
          )
          .select(null);
      context.go(
        '/consultation/${appointment.id}${appointment.status == 'CONFIRMED' ? '/confirmation' : ''}',
      );
    }
  }
}
