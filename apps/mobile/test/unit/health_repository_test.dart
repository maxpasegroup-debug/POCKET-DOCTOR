import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pocket_doctor/core/networking/health_repository.dart';

void main() {
  final base = Uri.parse('http://localhost:3000/api/v1');
  test(
    'calls the versioned health endpoint and validates service identity',
    () async {
      final client = MockClient((request) async {
        expect(request.url.toString(), 'http://localhost:3000/api/v1/health');
        expect(request.headers.containsKey('authorization'), false);
        return http.Response(
          '{"data":{"status":"ok","service":"pocket-doctor-api"}}',
          200,
        );
      });
      addTearDown(client.close);
      expect(await HealthRepository(client, base).checkLiveness(), true);
    },
  );
  test(
    'handles unavailable, malformed and unexpected service responses',
    () async {
      for (final response in [
        http.Response('private error', 503),
        http.Response('invalid', 200),
        http.Response('{"data":{"status":"ok"}}', 200),
      ]) {
        final client = MockClient((_) async => response);
        addTearDown(client.close);
        await expectLater(
          HealthRepository(client, base).checkLiveness(),
          throwsA(isA<ApiException>()),
        );
      }
    },
  );
  test('network failures are mapped to a safe error', () async {
    final client = MockClient(
      (_) async => throw http.ClientException('private URL'),
    );
    addTearDown(client.close);
    await expectLater(
      HealthRepository(client, base).checkLiveness(),
      throwsA(
        isA<ApiException>().having(
          (e) => e.message,
          'message',
          'Could not connect to the service.',
        ),
      ),
    );
  });
}
