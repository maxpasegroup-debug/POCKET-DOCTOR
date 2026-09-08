import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';

class ApiException implements Exception {
  const ApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Phase 0 read-only connectivity boundary. No credentials or health data.
class HealthRepository {
  const HealthRepository(this._client, this._baseUri);
  final http.Client _client;
  final Uri _baseUri;
  Future<bool> checkLiveness() async {
    try {
      final response = await _client
          .get(
            _baseUri.replace(path: '${_baseUri.path}/health'),
            headers: {'Accept': 'application/json'},
          )
          .timeout(const Duration(seconds: 5));
      if (response.statusCode != 200) {
        throw const ApiException('Service is unavailable.');
      }
      final body = jsonDecode(response.body);
      if (body is! Map<String, dynamic> ||
          body['data'] is! Map<String, dynamic> ||
          body['data']['status'] != 'ok' ||
          body['data']['service'] != 'pocket-doctor-api') {
        throw const ApiException('Service response was not recognized.');
      }
      return true;
    } on ApiException {
      rethrow;
    } catch (_) {
      throw const ApiException('Could not connect to the service.');
    }
  }
}

final httpClientProvider = Provider<http.Client>((ref) {
  final client = http.Client();
  ref.onDispose(client.close);
  return client;
});
final healthRepositoryProvider = Provider<HealthRepository>(
  (ref) => HealthRepository(
    ref.watch(httpClientProvider),
    ref.watch(appConfigProvider).apiBaseUri,
  ),
);
// Used by connectivity validation, not presented as health status to users.
final apiHealthProvider = FutureProvider.autoDispose<bool>(
  (ref) => ref.watch(healthRepositoryProvider).checkLiveness(),
);
