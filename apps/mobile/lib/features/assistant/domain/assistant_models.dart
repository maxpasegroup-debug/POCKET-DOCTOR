class AssistantFact {
  const AssistantFact(this.label, this.value, this.route);
  final String label, value, route;
  factory AssistantFact.fromJson(Map<String, dynamic> j) => AssistantFact(
    j['label'] as String,
    j['value'] as String? ?? '',
    j['route'] as String,
  );
}

class AssistantReply {
  const AssistantReply(
    this.text,
    this.classification,
    this.mode,
    this.actions,
    this.facts,
  );
  final String text, classification, mode;
  final List<AssistantFact> actions, facts;
  factory AssistantReply.fromJson(Map<String, dynamic> j) => AssistantReply(
    j['text'] as String,
    j['classification'] as String,
    j['mode'] as String,
    (j['actions'] as List)
        .map((v) => AssistantFact.fromJson(Map<String, dynamic>.from(v as Map)))
        .toList(),
    (j['facts'] as List)
        .map((v) => AssistantFact.fromJson(Map<String, dynamic>.from(v as Map)))
        .toList(),
  );
}

class AssistantTurn {
  const AssistantTurn(this.id, this.prompt, this.reply);
  final String id, prompt;
  final AssistantReply reply;
  factory AssistantTurn.fromJson(Map<String, dynamic> j) => AssistantTurn(
    j['id'] as String,
    j['prompt'] as String,
    AssistantReply.fromJson(Map<String, dynamic>.from(j['response'] as Map)),
  );
}

class AssistantConversation {
  const AssistantConversation(this.id, this.createdAt, this.messages);
  final String id;
  final DateTime createdAt;
  final List<AssistantTurn> messages;
  factory AssistantConversation.fromJson(Map<String, dynamic> j) =>
      AssistantConversation(
        j['id'] as String,
        DateTime.parse(j['createdAt'] as String),
        ((j['messages'] as List?) ?? [])
            .map(
              (v) =>
                  AssistantTurn.fromJson(Map<String, dynamic>.from(v as Map)),
            )
            .toList(),
      );
}

enum WellnessRecordKind { memory, goals, checkIns, reminders }

extension WellnessRecordInfo on WellnessRecordKind {
  String get path => switch (this) {
    WellnessRecordKind.memory => '/ai/memory',
    WellnessRecordKind.goals => '/me/goals',
    WellnessRecordKind.checkIns => '/me/check-ins',
    WellnessRecordKind.reminders => '/me/reminders',
  };
  String get title => switch (this) {
    WellnessRecordKind.memory => 'AI Memory',
    WellnessRecordKind.goals => 'Wellness goals',
    WellnessRecordKind.checkIns => 'Daily check-in',
    WellnessRecordKind.reminders => 'Reminders',
  };
  String get route => switch (this) {
    WellnessRecordKind.memory => '/assistant/memory',
    WellnessRecordKind.goals => '/assistant/goals',
    WellnessRecordKind.checkIns => '/assistant/check-ins',
    WellnessRecordKind.reminders => '/assistant/reminders',
  };
}

// The editor keeps original typed JSON fields for lossless updates. UI summaries
// are derived here, not guessed by widgets or an AI model.
class WellnessRecord {
  WellnessRecord(this.kind, Map<String, dynamic> value)
    : data = Map.unmodifiable(value);
  final WellnessRecordKind kind;
  final Map<String, dynamic> data;
  String get id => data['id'] as String;
  String get title => (data['title'] ?? data['text'] ?? data['date']) as String;
  String get summary => switch (kind) {
    WellnessRecordKind.memory => 'Saved only because you asked',
    WellnessRecordKind.goals =>
      '${data['progress']}% · ${data['status']}\nYour target: ${data['target']}',
    WellnessRecordKind.checkIns =>
      '${data['mood']} · Energy ${data['energy']}/5\nSleep: ${data['sleepHours'] ?? 'not recorded'} hours',
    WellnessRecordKind.reminders =>
      '${DateTime.parse(data['dueAt'] as String).toLocal()}\n${data['completed'] == true ? 'Done' : 'Saved · app only'}',
  };
}

const assistantPreferenceLabels = {
  'providerConsent': 'Allow chat processing',
  'useMemory': 'Use saved memory in my wellness summary',
  'appReminders': 'Show reminders in the app',
  'whatsappReminders': 'WhatsApp reminders (delivery not active)',
  'programReminders': 'Program reminders',
  'consultationReminders': 'Consultation reminders',
  'wellnessReminders': 'Wellness reminders',
};

bool validAssistantRoute(String route) => RegExp(
  r'^/(membership|consult|programs|my-programs|my-consultations|consultation|orders|wellness|products|assistant)(/[a-zA-Z0-9-]+)*$',
).hasMatch(route);
