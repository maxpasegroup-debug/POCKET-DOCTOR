import '../../profile/domain/user_profile.dart';

class OtpChallenge {
  const OtpChallenge({
    required this.id,
    required this.phone,
    required this.resendAt,
    required this.expiresAt,
    this.developmentCode,
  });
  factory OtpChallenge.fromJson(Map<String, dynamic> json, String phone) =>
      OtpChallenge(
        id: json['challengeId'] as String,
        phone: phone,
        resendAt: DateTime.now().add(
          Duration(seconds: json['resendAfterSeconds'] as int),
        ),
        expiresAt: DateTime.now().add(
          Duration(seconds: json['expiresInSeconds'] as int),
        ),
        developmentCode: json['developmentCode'] as String?,
      );
  final String id, phone;
  final DateTime resendAt, expiresAt;
  final String? developmentCode;
}

class AuthSession {
  const AuthSession(this.token, this.user);
  final String token;
  final UserProfile user;
}

enum AuthPhase { initializing, signedOut, otp, profileRequired, signedIn }

class AuthState {
  const AuthState({
    this.phase = AuthPhase.initializing,
    this.user,
    this.challenge,
    this.onboarded = false,
    this.busy = false,
    this.error,
  });
  final AuthPhase phase;
  final UserProfile? user;
  final OtpChallenge? challenge;
  final bool onboarded, busy;
  final String? error;
  AuthState withStatus({bool busy = false, String? error}) => AuthState(
    phase: phase,
    user: user,
    challenge: challenge,
    onboarded: onboarded,
    busy: busy,
    error: error,
  );
}

abstract final class PhoneNumber {
  static String? validate(String? value) {
    final digits = (value ?? '').replaceAll(RegExp(r'[\s()-]'), '');
    if (!RegExp(r'^[6-9][0-9]{9}$').hasMatch(digits)) {
      return 'Enter a valid 10-digit Indian mobile number.';
    }
    return null;
  }

  // Country normalization lives here; extend alongside server validation later.
  static String india(String value) =>
      '+91${value.replaceAll(RegExp(r'[\s()-]'), '')}';
}
