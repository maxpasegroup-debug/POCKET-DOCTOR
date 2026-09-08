import 'package:http/http.dart' as http;
import 'package:pocket_doctor/core/networking/api_client.dart';
import 'package:pocket_doctor/features/assistant/data/assistant_repository.dart';
import 'package:pocket_doctor/features/assistant/domain/assistant_models.dart';

class FakeAssistantRepository extends AssistantRepository {
  FakeAssistantRepository({this.fail = false, this.empty = true})
    : super(ApiClient(http.Client(), Uri.parse('http://localhost')));
  bool fail, empty;
  int sends = 0, deletes = 0, saves = 0;
  final items = <AssistantTurn>[];
  Map<String, bool> prefs = {
    for (final k in assistantPreferenceLabels.keys) k: false,
  };
  void check() {
    if (fail) throw const ApiFailure('Could not connect. Please try again.');
  }

  @override
  Future<Map<String, dynamic>> request(
    String method,
    String path, [
    Map<String, dynamic>? body,
  ]) async {
    check();
    if (path == '/ai/status') {
      return {'provider': 'development', 'available': true};
    }
    if (path == '/ai/reminder-events') return {'items': <Object>[]};
    if (path == '/integrations/whatsapp/link') {
      return {
        'connected': false,
        'providerReady': false,
        'deliveryAvailable': false,
      };
    }
    return {};
  }

  @override
  Future<String> createConversation() async {
    check();
    return 'conversation';
  }

  @override
  Future<List<AssistantConversation>> conversations(int page) async {
    check();
    return empty
        ? []
        : [AssistantConversation('conversation', DateTime(2026, 9, 7), items)];
  }

  @override
  Future<AssistantConversation> conversation(String id) async {
    check();
    return AssistantConversation(id, DateTime(2026, 9, 7), items);
  }

  @override
  Future<void> send(String id, String text, String key) async {
    check();
    sends++;
    items.add(
      AssistantTurn(
        'message',
        text,
        AssistantReply(
          'A qualified doctor can help with personal medical questions.',
          'doctor',
          'development',
          [const AssistantFact('Talk to a Doctor', '', '/consult')],
          [],
        ),
      ),
    );
  }

  @override
  Future<void> deleteConversation(String id) async {
    check();
    deletes++;
    empty = true;
  }

  @override
  Future<List<WellnessRecord>> records(
    WellnessRecordKind kind,
    int page,
  ) async {
    check();
    if (empty) return [];
    return [
      WellnessRecord(kind, switch (kind) {
        WellnessRecordKind.memory => {
          'id': 'record',
          'text': 'An evening routine',
        },
        WellnessRecordKind.goals => {
          'id': 'record',
          'title': 'My walking goal',
          'target': 'My routine',
          'progress': 25,
          'status': 'ACTIVE',
          'startDate': '2026-09-01',
        },
        WellnessRecordKind.checkIns => {
          'id': 'record',
          'date': '2026-09-01',
          'mood': 'Okay',
          'energy': 3,
          'sleepHours': 7,
        },
        WellnessRecordKind.reminders => {
          'id': 'record',
          'title': 'My reminder',
          'dueAt': '2026-09-08T12:00:00Z',
          'kind': 'PERSONAL',
          'completed': false,
        },
      }),
    ];
  }

  @override
  Future<void> saveRecord(
    WellnessRecordKind kind,
    Map<String, dynamic> data, {
    String? id,
  }) async {
    check();
    saves++;
  }

  @override
  Future<void> deleteRecord(WellnessRecordKind kind, String id) async {
    check();
    deletes++;
    empty = true;
  }

  @override
  Future<void> clearMemory() async {
    check();
    deletes++;
    empty = true;
  }

  @override
  Future<Map<String, bool>> preferences() async {
    check();
    return prefs;
  }

  @override
  Future<void> savePreferences(Map<String, bool> values) async {
    check();
    prefs = values;
  }
}
