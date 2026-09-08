import '../../profile/domain/user_profile.dart';
import 'auth_models.dart';

abstract interface class SessionRepository {
  Future<OtpChallenge> requestOtp(String phone);
  Future<AuthSession> verifyOtp(OtpChallenge challenge, String code);
  Future<UserProfile> currentUser();
  Future<UserProfile> updateProfile(ProfileDraft draft);
  Future<void> signOut();
}
