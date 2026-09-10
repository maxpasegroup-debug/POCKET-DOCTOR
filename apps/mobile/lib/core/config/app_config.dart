import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/foundation.dart';

enum AppEnvironment { development, staging, production }

class AppConfig {
  AppConfig({
    required this.environment,
    required String apiBaseUrl,
    this.showDevelopmentOtp = false,
  }) : apiBaseUri = _validate(environment, apiBaseUrl);
  factory AppConfig.fromEnvironment() {
    const name = String.fromEnvironment('APP_ENV', defaultValue: 'development');
    const developmentOtp = bool.fromEnvironment('SHOW_DEVELOPMENT_OTP');
    if ((kReleaseMode && name == 'development') ||
        (developmentOtp && (name == 'production' || !kDebugMode))) {
      throw StateError(
        'Release builds need an explicit staging/production configuration without development OTP.',
      );
    }
    return AppConfig(
      showDevelopmentOtp: const bool.fromEnvironment('SHOW_DEVELOPMENT_OTP'),
      environment: AppEnvironment.values.byName(
        const String.fromEnvironment('APP_ENV', defaultValue: 'development'),
      ),
      apiBaseUrl: const String.fromEnvironment(
        'API_BASE_URL',
        defaultValue: 'http://localhost:3000/api/v1',
      ),
    );
  }
  final AppEnvironment environment;
  final bool showDevelopmentOtp;
  bool get canPreviewOtp =>
      kDebugMode &&
      environment != AppEnvironment.production &&
      showDevelopmentOtp;
  final Uri apiBaseUri;
  static Uri _validate(AppEnvironment environment, String value) {
    final uri = Uri.tryParse(value);
    if (uri == null ||
        !uri.hasAuthority ||
        uri.host.isEmpty ||
        !['http', 'https'].contains(uri.scheme) ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        !uri.path.endsWith('/api/v1') ||
        (environment != AppEnvironment.development && uri.scheme != 'https')) {
      throw ArgumentError(
        'API_BASE_URL must be an API v1 URL; staging and production require HTTPS.',
      );
    }
    return uri;
  }
}

final appConfigProvider = Provider<AppConfig>(
  (ref) => AppConfig.fromEnvironment(),
);
