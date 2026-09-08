import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/networking/api_client.dart';
import '../../profile/domain/user_profile.dart';
import '../domain/auth_models.dart';
import '../domain/session_repository.dart';

class ApiSessionRepository implements SessionRepository {
  const ApiSessionRepository(this.client);
  final ApiClient client;
  @override
  Future<OtpChallenge> requestOtp(String phone) async => OtpChallenge.fromJson(
    await client.request('POST', '/auth/otp/request', body: {'phone': phone}),
    phone,
  );
  @override
  Future<AuthSession> verifyOtp(OtpChallenge challenge, String code) async {
    final data = await client.request(
      'POST',
      '/auth/otp/verify',
      body: {'challengeId': challenge.id, 'code': code},
    );
    return AuthSession(
      data['token'] as String,
      UserProfile.fromJson(data['user'] as Map<String, dynamic>),
    );
  }

  @override
  Future<UserProfile> currentUser() async {
    final data = await client.request(
      'GET',
      '/auth/session',
      authenticated: true,
    );
    return UserProfile.fromJson(data['user'] as Map<String, dynamic>);
  }

  @override
  Future<UserProfile> updateProfile(ProfileDraft draft) async {
    final data = await client.request(
      'PATCH',
      '/users/me',
      body: draft.toJson(),
      authenticated: true,
    );
    return UserProfile.fromJson(data['user'] as Map<String, dynamic>);
  }

  @override
  Future<void> signOut() async {
    await client.request('POST', '/auth/logout', authenticated: true);
  }
}

final sessionRepositoryProvider = Provider<SessionRepository>(
  (ref) => ApiSessionRepository(ref.watch(apiClientProvider)),
);
