import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

abstract interface class SessionStore {
  Future<String?> readToken();
  Future<void> writeToken(String token);
  Future<void> clearToken();
  Future<bool> hasOnboarded();
  Future<void> finishOnboarding();
}

class DeviceSessionStore implements SessionStore {
  final FlutterSecureStorage _secure = const FlutterSecureStorage();
  final SharedPreferencesAsync _preferences = SharedPreferencesAsync();
  String? _webToken;
  // Browser validation target keeps credentials in memory, never localStorage.
  @override
  Future<String?> readToken() async {
    if (await _preferences.getBool('pd.signedOut') == true) {
      return null;
    }
    return kIsWeb ? _webToken : _secure.read(key: 'pd.session');
  }

  @override
  Future<void> writeToken(String token) async {
    if (kIsWeb) {
      _webToken = token;
    } else {
      await _secure.write(key: 'pd.session', value: token);
    }
    await _preferences.setBool('pd.signedOut', false);
  }

  @override
  Future<void> clearToken() async {
    _webToken = null;
    try {
      await _preferences.setBool('pd.signedOut', true);
    } finally {
      if (!kIsWeb) {
        await _secure.delete(key: 'pd.session');
      }
    }
  }

  @override
  Future<bool> hasOnboarded() async =>
      await _preferences.getBool('pd.onboarded') ?? false;
  @override
  Future<void> finishOnboarding() => _preferences.setBool('pd.onboarded', true);
}

final sessionStoreProvider = Provider<SessionStore>(
  (ref) => DeviceSessionStore(),
);
