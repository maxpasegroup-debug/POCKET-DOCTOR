import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../application/assistant_providers.dart';
import '../domain/assistant_models.dart';
import 'assistant_screen.dart';

class WellnessRecordsScreen extends ConsumerStatefulWidget {
  const WellnessRecordsScreen({super.key, required this.kind});
  final WellnessRecordKind kind;
  @override
  ConsumerState<WellnessRecordsScreen> createState() => _RecordsState();
}

class _RecordsState extends ConsumerState<WellnessRecordsScreen> {
  int page = 1;
  void edit([WellnessRecord? record]) => Navigator.push(
    context,
    MaterialPageRoute<void>(
      builder: (_) => WellnessRecordEditor(kind: widget.kind, record: record),
    ),
  );
  @override
  Widget build(BuildContext context) {
    final action = ref.watch(assistantActionsProvider);
    final kind = widget.kind;
    return DetailPage(
      title: kind.title,
      children: [
        Text(switch (kind) {
          WellnessRecordKind.memory =>
            'Only information you explicitly save appears here. Edit or delete it whenever you choose. Deleting memory does not delete conversations; manage those separately.',
          WellnessRecordKind.goals =>
            'Choose your own goal and track your progress. This is wellness support, not a treatment plan.',
          WellnessRecordKind.checkIns =>
            'An optional moment to reflect. Record only what feels useful. These entries are not clinically interpreted.',
          WellnessRecordKind.reminders =>
            'Choose what to remember and when. Reminders appear in the app when you open it. Background and WhatsApp delivery are not active.',
        }),
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: action.isLoading ? null : () => edit(),
          icon: const Icon(Icons.add),
          label: Text(
            kind == WellnessRecordKind.checkIns
                ? 'Check in today'
                : 'Add ${kind == WellnessRecordKind.memory
                      ? 'memory'
                      : kind == WellnessRecordKind.goals
                      ? 'goal'
                      : 'reminder'}',
          ),
        ),
        if (kind == WellnessRecordKind.memory)
          TextButton(
            onPressed: action.isLoading
                ? null
                : () async {
                    if (await confirmAssistantDelete(
                      context,
                      'Clear all saved AI memory?',
                    )) {
                      await ref
                          .read(assistantActionsProvider.notifier)
                          .run((r) => r.clearMemory());
                    }
                  },
            child: const Text('Clear all memory'),
          ),
        if (action.hasError) ErrorNotice(message: action.error.toString()),
        const SizedBox(height: 16),
        ref
            .watch(assistantRecordsProvider((kind, page)))
            .when(
              data: (items) => Column(
                children: [
                  if (items.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Text(
                        'Nothing saved yet. Start when you are ready.',
                      ),
                    ),
                  for (final item in items)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            item.title,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 8),
                          Text(item.summary),
                          if (kind == WellnessRecordKind.goals)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: LinearProgressIndicator(
                                value:
                                    (item.data['progress'] as num).toDouble() /
                                    100,
                                semanticsLabel: 'Self-reported goal progress',
                              ),
                            ),
                          Wrap(
                            spacing: 12,
                            children: [
                              TextButton(
                                onPressed: action.isLoading
                                    ? null
                                    : () => edit(item),
                                child: const Text('Edit'),
                              ),
                              TextButton(
                                onPressed: action.isLoading
                                    ? null
                                    : () async {
                                        if (await confirmAssistantDelete(
                                          context,
                                          'Delete this saved item?',
                                        )) {
                                          await ref
                                              .read(
                                                assistantActionsProvider
                                                    .notifier,
                                              )
                                              .run(
                                                (r) => r.deleteRecord(
                                                  kind,
                                                  item.id,
                                                ),
                                              );
                                        }
                                      },
                                child: const Text('Delete'),
                              ),
                            ],
                          ),
                          const Divider(),
                        ],
                      ),
                    ),
                  Wrap(
                    spacing: 12,
                    children: [
                      if (page > 1)
                        TextButton(
                          onPressed: () => setState(() => page--),
                          child: const Text('Previous'),
                        ),
                      if (items.length == 20 &&
                          kind != WellnessRecordKind.memory)
                        TextButton(
                          onPressed: () => setState(() => page++),
                          child: const Text('Next'),
                        ),
                    ],
                  ),
                ],
              ),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorNotice(
                message: e.toString(),
                onRetry: () =>
                    ref.invalidate(assistantRecordsProvider((kind, page))),
              ),
            ),
      ],
    );
  }
}

class WellnessRecordEditor extends ConsumerStatefulWidget {
  const WellnessRecordEditor({super.key, required this.kind, this.record});
  final WellnessRecordKind kind;
  final WellnessRecord? record;
  @override
  ConsumerState<WellnessRecordEditor> createState() => _EditorState();
}

class _EditorState extends ConsumerState<WellnessRecordEditor> {
  final form = GlobalKey<FormState>();
  final fields = <String, TextEditingController>{};
  late DateTime date, dueAt;
  DateTime? targetDate;
  String mood = 'Okay', reminderKind = 'PERSONAL';
  double energy = 3, progress = 0;
  bool done = false, paused = false;
  @override
  void initState() {
    super.initState();
    final d = widget.record?.data ?? <String, dynamic>{};
    for (final key in [
      'title',
      'target',
      'text',
      'sleepHours',
      'waterMl',
      'activityMinutes',
      'weightKg',
    ]) {
      fields[key] = TextEditingController(text: d[key]?.toString() ?? '');
    }
    date =
        DateTime.tryParse((d['startDate'] ?? d['date'] ?? '') as String) ??
        DateTime.now();
    targetDate = DateTime.tryParse(d['targetDate'] as String? ?? '');
    dueAt =
        DateTime.tryParse(d['dueAt'] as String? ?? '')?.toLocal() ??
        DateTime.now().add(const Duration(hours: 1));
    mood = d['mood'] as String? ?? 'Okay';
    reminderKind = d['kind'] as String? ?? 'PERSONAL';
    energy = (d['energy'] as num?)?.toDouble() ?? 3;
    progress = (d['progress'] as num?)?.toDouble() ?? 0;
    done = d['completed'] == true || d['habitCompleted'] == true;
    paused = d['status'] == 'PAUSED';
  }

  @override
  void dispose() {
    for (final c in fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  String day(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  Widget field(
    String key,
    String label, {
    int max = 120,
    bool optional = false,
    double? upper,
    bool integer = false,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: TextFormField(
      controller: fields[key],
      maxLength: max,
      keyboardType: upper != null
          ? const TextInputType.numberWithOptions(decimal: true)
          : TextInputType.text,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      validator: (v) {
        if ((v ?? '').trim().isEmpty) {
          return optional ? null : 'Please enter $label.';
        }
        if (upper != null) {
          final n = double.tryParse(v!);
          if (n == null ||
              !n.isFinite ||
              n < (key == 'weightKg' ? 1 : 0) ||
              n > upper ||
              (integer && n != n.roundToDouble())) {
            return 'Enter a valid value up to $upper.';
          }
        }
        return null;
      },
    ),
  );
  Future<void> chooseDate(bool target) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: target ? targetDate ?? DateTime.now() : date,
      firstDate: DateTime(1900),
      lastDate: widget.kind == WellnessRecordKind.checkIns
          ? DateTime.now()
          : DateTime(2100),
    );
    if (picked != null) {
      setState(() {
        if (target) {
          targetDate = picked;
        } else {
          date = picked;
        }
      });
    }
  }

  Future<void> chooseReminderTime() async {
    final d = await showDatePicker(
      context: context,
      initialDate: dueAt,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (d == null || !mounted) return;
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(dueAt),
    );
    if (t != null) {
      setState(
        () => dueAt = DateTime(d.year, d.month, d.day, t.hour, t.minute),
      );
    }
  }

  Future<void> save() async {
    if (!form.currentState!.validate()) return;
    if (widget.kind == WellnessRecordKind.goals &&
        targetDate != null &&
        targetDate!.isBefore(DateTime(date.year, date.month, date.day))) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Target date must follow the start date.'),
        ),
      );
      return;
    }
    final Map<String, dynamic> data = switch (widget.kind) {
      WellnessRecordKind.memory => {'text': fields['text']!.text.trim()},
      WellnessRecordKind.goals => {
        'title': fields['title']!.text.trim(),
        'target': fields['target']!.text.trim(),
        'startDate': day(date),
        'targetDate': targetDate == null ? null : day(targetDate!),
        'progress': progress.round(),
        'status': progress == 100
            ? 'COMPLETED'
            : paused
            ? 'PAUSED'
            : 'ACTIVE',
      },
      WellnessRecordKind.checkIns => {
        'date': day(date),
        'mood': mood,
        'energy': energy.round(),
        'sleepHours': double.tryParse(fields['sleepHours']!.text),
        'waterMl': int.tryParse(fields['waterMl']!.text),
        'activityMinutes': int.tryParse(fields['activityMinutes']!.text),
        'weightKg': double.tryParse(fields['weightKg']!.text),
        'habitCompleted': done,
      },
      WellnessRecordKind.reminders => {
        'title': fields['title']!.text.trim(),
        'kind': reminderKind,
        'dueAt': dueAt.toUtc().toIso8601String(),
        'completed': done,
      },
    };
    final saved = await ref.read(assistantActionsProvider.notifier).run((
      r,
    ) async {
      await r.saveRecord(widget.kind, data, id: widget.record?.id);
      return true;
    });
    if (saved == true && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final action = ref.watch(assistantActionsProvider);
    return DetailPage(
      title: widget.kind.title,
      children: [
        Form(
          key: form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (widget.kind == WellnessRecordKind.memory) ...[
                const Text(
                  'Save only what you want the assistant to remember. You can delete it later.',
                ),
                const SizedBox(height: 16),
                field('text', 'Remember this', max: 300),
              ],
              if (widget.kind == WellnessRecordKind.goals) ...[
                field('title', 'Goal'),
                field('target', 'Your target'),
                TextButton(
                  onPressed: () => chooseDate(false),
                  child: Text('Start date: ${day(date)}'),
                ),
                TextButton(
                  onPressed: () => chooseDate(true),
                  child: Text(
                    'Target date: ${targetDate == null ? 'Optional' : day(targetDate!)}',
                  ),
                ),
                if (targetDate != null)
                  TextButton(
                    onPressed: () => setState(() => targetDate = null),
                    child: const Text('Remove target date'),
                  ),
                Text('Your progress: ${progress.round()}%'),
                Slider(
                  value: progress,
                  min: 0,
                  max: 100,
                  divisions: 100,
                  label: '${progress.round()}%',
                  onChanged: (v) => setState(() => progress = v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Pause this goal'),
                  value: paused,
                  onChanged: progress == 100
                      ? null
                      : (v) => setState(() => paused = v),
                ),
              ],
              if (widget.kind == WellnessRecordKind.checkIns) ...[
                TextButton(
                  onPressed: () => chooseDate(false),
                  child: Text('Date: ${day(date)}'),
                ),
                DropdownButtonFormField<String>(
                  initialValue: mood,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'How are you feeling?',
                  ),
                  items: [
                    for (final v in [
                      'Good',
                      'Okay',
                      'Low',
                      'Prefer not to say',
                    ])
                      DropdownMenuItem(value: v, child: Text(v)),
                  ],
                  onChanged: (v) => setState(() => mood = v!),
                ),
                const SizedBox(height: 16),
                Text('Energy: ${energy.round()}/5'),
                Slider(
                  value: energy,
                  min: 1,
                  max: 5,
                  divisions: 4,
                  label: '${energy.round()}',
                  onChanged: (v) => setState(() => energy = v),
                ),
                field(
                  'sleepHours',
                  'Sleep hours (optional)',
                  optional: true,
                  upper: 24,
                ),
                field(
                  'waterMl',
                  'Water in ml (optional)',
                  optional: true,
                  upper: 20000,
                  integer: true,
                ),
                field(
                  'activityMinutes',
                  'Activity minutes (optional)',
                  optional: true,
                  upper: 1440,
                  integer: true,
                ),
                field(
                  'weightKg',
                  'Weight in kg (optional)',
                  optional: true,
                  upper: 700,
                ),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Completed my chosen habit'),
                  value: done,
                  onChanged: (v) => setState(() => done = v!),
                ),
              ],
              if (widget.kind == WellnessRecordKind.reminders) ...[
                field('title', 'Remind me to'),
                DropdownButtonFormField<String>(
                  initialValue: reminderKind,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Reminder category',
                  ),
                  items: [
                    for (final v in [
                      'PERSONAL',
                      'WELLNESS',
                      'PROGRAM',
                      'CONSULTATION',
                    ])
                      DropdownMenuItem(value: v, child: Text(v)),
                  ],
                  onChanged: (v) => setState(() => reminderKind = v!),
                ),
                TextButton(
                  onPressed: chooseReminderTime,
                  child: Text(
                    'Local time: ${dueAt.toString().substring(0, 16)}',
                  ),
                ),
                if (widget.record != null)
                  CheckboxListTile(
                    title: const Text('Mark done'),
                    value: done,
                    onChanged: (v) => setState(() => done = v!),
                  ),
              ],
              if (action.hasError)
                ErrorNotice(message: action.error.toString(), onRetry: save),
              ActionButton(
                label: 'Save',
                busy: action.isLoading,
                onPressed: save,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
