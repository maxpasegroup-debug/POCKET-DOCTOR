import '../../../core/networking/api_client.dart';

class PrivacyRepository {
  PrivacyRepository(this.api);
  final ApiClient api;
  Future<Map<String, dynamic>> privacy() =>
      api.request('GET', '/me/privacy', authenticated: true);
  Future<void> consent(
    String type,
    bool granted, {
    String version = '1',
  }) async {
    await api.request(
      'POST',
      '/me/consents',
      authenticated: true,
      body: {'type': type, 'version': version, 'granted': granted},
    );
  }

  Future<void> deleteAccess() async {
    await api.request(
      'POST',
      '/me/privacy/deletion',
      authenticated: true,
      body: {'confirmation': 'DELETE MY ACCOUNT'},
    );
  }

  Future<Map<String, dynamic>> export(String category, int page) => api.request(
    'GET',
    '/me/export',
    authenticated: true,
    query: {'category': category, 'page': '$page'},
  );
  Future<Map<String, dynamic>> notifications(int page) => api.request(
    'GET',
    '/me/notifications',
    authenticated: true,
    query: {'page': '$page'},
  );
  Future<void> markRead(String id) async {
    await api.request(
      'POST',
      '/me/notifications/$id/read',
      authenticated: true,
      body: {},
    );
  }
}
