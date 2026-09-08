import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_doctor/core/config/app_config.dart';

void main() {
  test(
    'development accepts local API, deployed environments require HTTPS',
    () {
      expect(
        AppConfig(
          environment: AppEnvironment.development,
          apiBaseUrl: 'http://localhost:3000/api/v1',
        ).apiBaseUri.host,
        'localhost',
      );
      for (final environment in [
        AppEnvironment.staging,
        AppEnvironment.production,
      ]) {
        expect(
          () => AppConfig(
            environment: environment,
            apiBaseUrl: 'http://example.com/api/v1',
          ),
          throwsArgumentError,
        );
        expect(
          AppConfig(
            environment: environment,
            apiBaseUrl: 'https://api.example.com/api/v1',
          ).apiBaseUri.scheme,
          'https',
        );
      }
    },
  );
  test('invalid API URLs cannot embed credentials or queries', () {
    for (final value in [
      'invalid',
      'https://user:secret@example.com/api/v1',
      'https://example.com/api/v1?token=secret',
      'https://example.com/',
    ]) {
      expect(
        () => AppConfig(
          environment: AppEnvironment.development,
          apiBaseUrl: value,
        ),
        throwsArgumentError,
      );
    }
  });
}
