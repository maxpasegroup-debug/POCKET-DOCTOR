import '../../../core/networking/api_client.dart';
import '../domain/assistant_models.dart';

class AssistantRepository {
  AssistantRepository(this.api);
  final ApiClient api;
  Future<Map<String, dynamic>> request(
    String method,
    String path, [
    Map<String, dynamic>? body,
  ]) => api.request(method, path, body: body, authenticated: true);
  Future<List<AssistantConversation>> conversations(int page) async =>
      ((await api.request(
                'GET',
                '/ai/conversations',
                query: {'page': '$page'},
                authenticated: true,
              ))['items']
              as List)
          .map(
            (v) => AssistantConversation.fromJson(
              Map<String, dynamic>.from(v as Map),
            ),
          )
          .toList();
  Future<AssistantConversation> conversation(String id) async =>
      AssistantConversation.fromJson(
        (await request('GET', '/ai/conversations/$id'))['item']
            as Map<String, dynamic>,
      );
  Future<String> createConversation() async =>
      ((await request('POST', '/ai/conversations', {}))['item'] as Map)['id']
          as String;
  Future<void> send(String id, String text, String key) async {
    await request('POST', '/ai/conversations/$id/messages', {
      'text': text,
      'requestKey': key,
    });
  }

  Future<void> deleteConversation(String id) async {
    await request('DELETE', '/ai/conversations/$id');
  }

  Future<List<WellnessRecord>> records(
    WellnessRecordKind kind,
    int page,
  ) async {
    final result = await api.request(
      'GET',
      kind.path,
      authenticated: true,
      query: kind == WellnessRecordKind.memory ? null : {'page': '$page'},
    );
    return (result['items'] as List)
        .map((v) => WellnessRecord(kind, Map<String, dynamic>.from(v as Map)))
        .toList();
  }

  Future<void> saveRecord(
    WellnessRecordKind kind,
    Map<String, dynamic> data, {
    String? id,
  }) async {
    await request(
      id == null || kind == WellnessRecordKind.checkIns ? 'POST' : 'PATCH',
      '${kind.path}${id == null || kind == WellnessRecordKind.checkIns ? '' : '/$id'}',
      data,
    );
  }

  Future<void> deleteRecord(WellnessRecordKind kind, String id) async {
    await request('DELETE', '${kind.path}/$id');
  }

  Future<void> clearMemory() async {
    await request('DELETE', '/ai/memory');
  }

  Future<Map<String, bool>> preferences() async {
    final item = (await request('GET', '/ai/preferences'))['item'] as Map;
    return {
      for (final key in assistantPreferenceLabels.keys) key: item[key] == true,
    };
  }

  Future<void> savePreferences(Map<String, bool> values) async {
    await request('PATCH', '/ai/preferences', values);
  }
}
