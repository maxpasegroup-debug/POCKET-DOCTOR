import 'package:pocket_doctor/core/networking/api_client.dart';
import 'package:pocket_doctor/core/storage/session_store.dart';
import 'package:pocket_doctor/features/auth/application/auth_controller.dart';
import 'package:pocket_doctor/features/auth/domain/auth_models.dart';
import 'package:pocket_doctor/features/auth/domain/session_repository.dart';
import 'package:pocket_doctor/features/profile/domain/user_profile.dart';

const testUser = UserProfile(
  id: 'test-user',
  phone: '+919876543210',
  fullName: 'Test Person',
  interests: ['Sleep'],
  profileComplete: true,
);

class MemorySessionStore implements SessionStore {
  String? token;
  bool onboarded = false;
  @override
  Future<String?> readToken() async => token;
  @override
  Future<void> writeToken(String value) async {
    token = value;
  }

  @override
  Future<void> clearToken() async {
    token = null;
  }

  @override
  Future<bool> hasOnboarded() async => onboarded;
  @override
  Future<void> finishOnboarding() async {
    onboarded = true;
  }
}

class FakeSessionRepository implements SessionRepository {
  UserProfile user = const UserProfile(id: 'test-user', phone: '+919876543210');
  ApiFailure? failure;
  bool revoked = false;
  @override
  Future<OtpChallenge> requestOtp(String phone) async {
    if (failure != null) {
      throw failure!;
    }
    return OtpChallenge(
      id: 'test-challenge',
      phone: phone,
      resendAt: DateTime.now().add(const Duration(seconds: 60)),
      expiresAt: DateTime.now().add(const Duration(minutes: 5)),
    );
  }

  @override
  Future<AuthSession> verifyOtp(OtpChallenge challenge, String code) async {
    if (failure != null) {
      throw failure!;
    }
    if (code != '123456') {
      throw const ApiFailure('That code is incorrect.', status: 400);
    }
    return AuthSession('test-token', user);
  }

  @override
  Future<UserProfile> currentUser() async {
    if (failure != null) {
      throw failure!;
    }
    return user;
  }

  @override
  Future<UserProfile> updateProfile(ProfileDraft draft) async {
    if (failure != null) {
      throw failure!;
    }
    user = UserProfile(
      id: user.id,
      phone: user.phone,
      fullName: draft.fullName.trim(),
      language: draft.language,
      interests: draft.interests,
      notifications: draft.notifications,
      profileComplete: true,
    );
    return user;
  }

  @override
  Future<void> signOut() async {
    if (failure != null) {
      throw failure!;
    }
    revoked = true;
  }
}

class ReadyAuthController extends AuthController {
  ReadyAuthController(this.initial);
  final AuthState initial;
  @override
  AuthState build() => initial;
  void seed(AuthState value) {
    state = value;
  }
}
