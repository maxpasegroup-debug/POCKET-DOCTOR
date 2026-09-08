import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/program_providers.dart';
import 'program_widgets.dart';

class ProgramsScreen extends ConsumerStatefulWidget {
  const ProgramsScreen({super.key, this.myPrograms = false});
  final bool myPrograms;
  @override
  ConsumerState<ProgramsScreen> createState() => _ProgramsScreenState();
}

class _ProgramsScreenState extends ConsumerState<ProgramsScreen> {
  final search = TextEditingController();
  late bool mine = widget.myPrograms;
  bool completed = false;
  bool allTopics = false;
  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filters = ref.watch(programFiltersProvider);
    final controller = ref.read(programFiltersProvider.notifier);
    return PageBody(
      children: [
        const SectionHeading(
          eyebrow: 'Learn & Transform',
          title: 'Knowledge for a healthier life.',
          description:
              'Learn at your pace. Build understanding, one step at a time.',
        ),
        Wrap(
          spacing: 8,
          children: [
            ChoiceChip(
              label: const Text('Explore'),
              selected: !mine,
              onSelected: (_) => setState(() => mine = false),
            ),
            ChoiceChip(
              label: const Text('My Programs'),
              selected: mine,
              onSelected: (_) => setState(() => mine = true),
            ),
          ],
        ),
        if (mine) ...[
          const PageSection('Your learning space'),
          Wrap(
            spacing: 8,
            children: [
              ChoiceChip(
                label: const Text('Active'),
                selected: !completed,
                onSelected: (_) => setState(() => completed = false),
              ),
              ChoiceChip(
                label: const Text('Completed'),
                selected: completed,
                onSelected: (_) => setState(() => completed = true),
              ),
            ],
          ),
          ProgramAsync(
            value: ref.watch(myProgramsProvider),
            onRetry: () => ref.invalidate(myProgramsProvider),
            builder: (items) {
              final visible = items
                  .where((item) => item.completed == completed)
                  .toList();
              return Column(
                children: [
                  if (visible.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 24),
                      child: Text(
                        completed
                            ? 'Your completed programs will appear here.'
                            : "You haven't joined a program yet.",
                      ),
                    ),
                  for (final item in visible)
                    ProgramCard(program: item.program, overview: item),
                ],
              );
            },
          ),
        ] else ...[
          const PageSection('Find your next step'),
          TextField(
            key: const Key('program-search'),
            controller: search,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              labelText: 'Search programs, topics or doctors',
              border: const OutlineInputBorder(),
              suffixIcon: IconButton(
                tooltip: 'Clear search',
                icon: const Icon(Icons.close),
                onPressed: () {
                  search.clear();
                  controller.set('q', '');
                },
              ),
            ),
            onSubmitted: (value) => controller.set('q', value.trim()),
          ),
          TextButton.icon(
            onPressed: () => controller.set('q', search.text.trim()),
            icon: const Icon(Icons.search),
            label: const Text('Search'),
          ),
          ProgramAsync(
            value: ref.watch(programCategoriesProvider),
            onRetry: () => ref.invalidate(programCategoriesProvider),
            builder: (categories) => Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ChoiceChip(
                  label: const Text('All topics'),
                  selected: !filters.containsKey('category'),
                  onSelected: (_) => controller.set('category', ''),
                ),
                for (final category in categories.where(
                  (category) =>
                      allTopics ||
                      categories.take(2).contains(category) ||
                      filters['category'] == category.id,
                ))
                  ChoiceChip(
                    label: Text(category.name),
                    selected: filters['category'] == category.id,
                    onSelected: (_) => controller.set('category', category.id),
                  ),
                if (categories.length > 2)
                  TextButton(
                    onPressed: () => setState(() => allTopics = !allTopics),
                    child: Text(allTopics ? 'Fewer topics' : 'More topics'),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          ExpansionTile(
            tilePadding: EdgeInsets.zero,
            title: const Text('Format, price & preferences'),
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final entry in {
                    'RECORDED': 'Recorded',
                    'LIVE': 'Live',
                  }.entries)
                    FilterChip(
                      label: Text(entry.value),
                      selected: filters['type'] == entry.key,
                      onSelected: (selected) =>
                          controller.set('type', selected ? entry.key : ''),
                    ),
                  for (final entry in {'free': 'Free', 'paid': 'Paid'}.entries)
                    FilterChip(
                      label: Text(entry.value),
                      selected: filters['price'] == entry.key,
                      onSelected: (selected) =>
                          controller.set('price', selected ? entry.key : ''),
                    ),
                  FilterChip(
                    label: const Text('60 minutes or less'),
                    selected: filters['duration'] == 'short',
                    onSelected: (selected) =>
                        controller.set('duration', selected ? 'short' : ''),
                  ),
                  FilterChip(
                    label: const Text('For my interests'),
                    selected: filters['recommended'] == 'true',
                    onSelected: (selected) =>
                        controller.set('recommended', selected ? 'true' : ''),
                  ),
                ],
              ),
            ],
          ),
          if (filters.isNotEmpty)
            TextButton(
              onPressed: () {
                search.clear();
                controller.clear();
              },
              child: const Text('Clear filters'),
            ),
          PageSection(
            filters.isEmpty ? 'Featured & more' : 'Your results',
            subtitle: filters['recommended'] == 'true'
                ? 'Based only on your selected wellness interests.'
                : null,
          ),
          ProgramAsync(
            value: ref.watch(programDiscoveryProvider),
            onRetry: () => ref.invalidate(programDiscoveryProvider),
            builder: (page) => Column(
              children: [
                if (page.programs.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      'No programs available yet. Try another topic or clear your search.',
                    ),
                  ),
                for (final program in page.programs)
                  ProgramCard(program: program),
                Wrap(
                  spacing: 12,
                  children: [
                    if (page.page > 1)
                      OutlinedButton(
                        onPressed: () => controller.page(page.page - 1),
                        child: const Text('Previous page'),
                      ),
                    if (page.hasNext)
                      OutlinedButton(
                        onPressed: () => controller.page(page.page + 1),
                        child: const Text('Next page'),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 24),
        const Text(educationNotice),
      ],
    );
  }
}
