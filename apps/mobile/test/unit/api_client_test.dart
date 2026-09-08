import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pocket_doctor/core/networking/api_client.dart';

void main() {
  final base = Uri.parse('http://localhost:3000/api/v1');
  test('program search query is encoded separately from route path', () async {
    final transport = MockClient((request) async {
      expect(request.url.path, '/api/v1/programs');
      expect(request.url.queryParameters['q'], 'Weight & wellness');
      return http.Response('{"data":{"programs":[]}}', 200);
    });
    addTearDown(transport.close);
    await (ApiClient(transport, base)..token = 'test').request(
      'GET',
      '/programs',
      authenticated: true,
      query: {'q': 'Weight & wellness'},
    );
  });
  test('typed envelope, method and bearer token', () async {
    final httpClient = MockClient((request) async {
      expect(request.url.path, '/api/v1/users/me');
      expect(request.method, 'PATCH');
      expect(request.headers['authorization'], 'Bearer test');
      return http.Response('{"data":{"saved":true}}', 200);
    });
    addTearDown(httpClient.close);
    final client = ApiClient(httpClient, base)..token = 'test';
    expect(
      await client.request(
        'PATCH',
        '/users/me',
        authenticated: true,
        body: {'fullName': 'Name'},
      ),
      {'saved': true},
    );
  });
  test('401 invokes expiry only for authenticated requests', () async {
    final httpClient = MockClient(
      (_) async => http.Response('{"error":{"code":"UNAUTHENTICATED"}}', 401),
    );
    addTearDown(httpClient.close);
    var expired = 0;
    final client = ApiClient(httpClient, base)
      ..token = 'test'
      ..onUnauthorized = () => expired++;
    await expectLater(
      client.request('GET', '/users/me', authenticated: true),
      throwsA(isA<ApiFailure>().having((error) => error.status, 'status', 401)),
    );
    expect(expired, 1);
    await expectLater(
      client.request('POST', '/auth/otp/verify'),
      throwsA(isA<ApiFailure>()),
    );
    expect(expired, 1);
  });
  test(
    'malformed and server errors expose no raw technical information',
    () async {
      for (final response in [
        http.Response('private stack trace', 500),
        http.Response('{"error":{"message":"private database details"}}', 500),
        http.Response('{}', 200),
      ]) {
        final httpClient = MockClient((_) async => response);
        addTearDown(httpClient.close);
        await expectLater(
          ApiClient(httpClient, base).request('GET', '/users/me'),
          throwsA(
            isA<ApiFailure>().having(
              (error) => error.message.contains('private'),
              'private details',
              false,
            ),
          ),
        );
      }
    },
  );
}
