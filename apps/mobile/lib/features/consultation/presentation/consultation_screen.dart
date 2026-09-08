import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/consultation_providers.dart';
import 'consultation_widgets.dart';

class ConsultationScreen extends ConsumerStatefulWidget {
  const ConsultationScreen({super.key, this.initialTab = 0});
  final int initialTab;
  @override
  ConsumerState<ConsultationScreen> createState() => _ConsultationScreenState();
}

class _ConsultationScreenState extends ConsumerState<ConsultationScreen> {
  int tab = 0;
  @override
  void initState() {
    super.initState();
    tab = widget.initialTab;
  }

  final search = TextEditingController();
  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PageBody(
    children: [
      const SectionHeading(
        eyebrow: 'Talk to a Doctor',
        title: 'Care begins with a conversation.',
        description:
            'Find a verified Pocket Doctor partner for professional medical guidance.',
      ),
      Wrap(
        spacing: 8,
        children: [
          for (final item in [
            (0, 'Find a Doctor'),
            (1, 'Upcoming'),
            (2, 'History'),
          ])
            ChoiceChip(
              label: Text(item.$2),
              selected: tab == item.$1,
              onSelected: (_) => setState(() => tab = item.$1),
            ),
        ],
      ),
      const SizedBox(height: 24),
      if (tab == 0) ...[
        TextField(
          controller: search,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            labelText: 'Search doctors',
            hintText: 'Name, specialty or language',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: IconButton(
              tooltip: 'Clear search',
              icon: const Icon(Icons.close),
              onPressed: () {
                search.clear();
                ref.read(doctorFiltersProvider.notifier).set('q', '');
              },
            ),
          ),
          onSubmitted: (value) =>
              ref.read(doctorFiltersProvider.notifier).set('q', value.trim()),
        ),
        const PageSection('Specialties'),
        ConsultationAsync(
          value: ref.watch(specialtiesProvider),
          onRetry: () => ref.invalidate(specialtiesProvider),
          builder: (items) => Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ChoiceChip(
                label: const Text('All specialties'),
                selected: ref.watch(doctorFiltersProvider)['specialty'] == null,
                onSelected: (_) => ref
                    .read(doctorFiltersProvider.notifier)
                    .set('specialty', ''),
              ),
              for (final specialty in items)
                ChoiceChip(
                  label: Text(specialty),
                  selected:
                      ref.watch(doctorFiltersProvider)['specialty'] ==
                      specialty,
                  onSelected: (_) => ref
                      .read(doctorFiltersProvider.notifier)
                      .set('specialty', specialty),
                ),
            ],
          ),
        ),
        FilterChip(
          label: const Text('Featured partners'),
          selected: ref.watch(doctorFiltersProvider)['featured'] == 'true',
          onSelected: (value) => ref
              .read(doctorFiltersProvider.notifier)
              .set('featured', value ? 'true' : ''),
        ),
        const SizedBox(height: 20),
        ConsultationAsync(
          value: ref.watch(doctorDiscoveryProvider),
          onRetry: () => ref.invalidate(doctorDiscoveryProvider),
          builder: (page) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (page.doctors.isEmpty)
                const Text(
                  'No matching doctors are available yet. Try another search or check back soon.',
                ),
              for (final doctor in page.doctors) DoctorCard(doctor: doctor),
              Wrap(
                spacing: 12,
                children: [
                  if (page.page > 1)
                    TextButton(
                      onPressed: () => ref
                          .read(doctorFiltersProvider.notifier)
                          .page(page.page - 1),
                      child: const Text('Previous'),
                    ),
                  if (page.page * 20 < page.total)
                    TextButton(
                      onPressed: () => ref
                          .read(doctorFiltersProvider.notifier)
                          .page(page.page + 1),
                      child: const Text('Next doctors'),
                    ),
                ],
              ),
            ],
          ),
        ),
      ] else
        ConsultationAsync(
          value: ref.watch(myConsultationsProvider),
          onRetry: () => ref.invalidate(myConsultationsProvider),
          builder: (appointments) {
            final items =
                appointments
                    .where((a) => tab == 1 ? a.upcoming : !a.upcoming)
                    .toList()
                  ..sort(
                    (a, b) => tab == 1
                        ? a.startsAt.compareTo(b.startsAt)
                        : b.startsAt.compareTo(a.startsAt),
                  );
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (items.isEmpty)
                  Text(
                    tab == 1
                        ? 'You have no upcoming consultations.'
                        : 'Your completed and cancelled consultations will appear here.',
                  ),
                for (final appointment in items)
                  AppointmentCard(appointment: appointment),
              ],
            );
          },
        ),
      const SizedBox(height: 24),
      const Text(emergencyNotice),
    ],
  );
}
