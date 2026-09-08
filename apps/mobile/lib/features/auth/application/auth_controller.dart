import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/networking/api_client.dart';
import '../../../core/storage/session_store.dart';
import '../../profile/domain/user_profile.dart';
import '../data/api_session_repository.dart';
import '../domain/auth_models.dart';

final authProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);
final currentUserProvider = Provider<UserProfile?>(
  (ref) => ref.watch(authProvider).user,
);

class AuthController extends Notifier<AuthState> {
  int _generation = 0;
  @override
  AuthState build() {
    final client = ref.read(apiClientProvider);
    client.onUnauthorized = () {
      unawaited(expireSession());
    };
    ref.onDispose(() {
      client.onUnauthorized = null;
      _generation++;
    });
    Future.microtask(initialize);
    return const AuthState();
  }

  String _message(Object error) => error is ApiFailure
      ? error.message
      : 'We could not save securely. Please try again.';

  Future<void> initialize() async {
    if (!ref.mounted) {
      return;
    }
    final generation = ++_generation;
    state = const AuthState();
    final store = ref.read(sessionStoreProvider);
    try {
      final onboarded = await store.hasOnboarded();
      final token = await store.readToken();
      if (generation != _generation) {
        return;
      }
      if (token == null) {
        state = AuthState(phase: AuthPhase.signedOut, onboarded: onboarded);
        return;
      }
      ref.read(apiClientProvider).token = token;
      final user = await ref.read(sessionRepositoryProvider).currentUser();
      if (generation == _generation) {
        _acceptUser(user);
      }
    } catch (error) {
      if (generation == _generation) {
        state = AuthState(error: _message(error));
      }
    }
  }

  Future<void> finishOnboarding() async {
    state = state.withStatus(busy: true);
    try {
      await ref.read(sessionStoreProvider).finishOnboarding();
      state = const AuthState(phase: AuthPhase.signedOut, onboarded: true);
    } catch (error) {
      state = state.withStatus(error: _message(error));
    }
  }

  Future<void> requestOtp(String phone) async {
    if (state.busy) {
      return;
    }
    final generation = _generation;
    state = state.withStatus(busy: true);
    try {
      final challenge = await ref
          .read(sessionRepositoryProvider)
          .requestOtp(phone);
      if (generation == _generation) {
        state = AuthState(
          phase: AuthPhase.otp,
          onboarded: true,
          challenge: challenge,
        );
      }
    } catch (error) {
      if (generation == _generation) {
        state = state.withStatus(error: _message(error));
      }
    }
  }

  void changeNumber() {
    _generation++;
    state = const AuthState(phase: AuthPhase.signedOut, onboarded: true);
  }

  Future<void> verifyOtp(String code) async {
    if (state.busy || state.challenge == null) {
      return;
    }
    if (!RegExp(r'^[0-9]{6}$').hasMatch(code)) {
      state = state.withStatus(error: 'Enter the six-digit code.');
      return;
    }
    final generation = _generation;
    state = state.withStatus(busy: true);
    try {
      final session = await ref
          .read(sessionRepositoryProvider)
          .verifyOtp(state.challenge!, code);
      if (generation != _generation) {
        return;
      }
      ref.read(apiClientProvider).token = session.token;
      try {
        await ref.read(sessionStoreProvider).writeToken(session.token);
      } catch (_) {
        try {
          await ref.read(sessionRepositoryProvider).signOut();
        } catch (_) {}
        ref.read(apiClientProvider).token = null;
        try {
          await ref.read(sessionStoreProvider).clearToken();
        } catch (_) {}
        rethrow;
      }
      if (generation == _generation) {
        _acceptUser(session.user);
      }
    } catch (error) {
      if (generation == _generation) {
        state = state.withStatus(error: _message(error));
      }
    }
  }

  void _acceptUser(UserProfile user) => state = AuthState(
    phase: user.profileComplete
        ? AuthPhase.signedIn
        : AuthPhase.profileRequired,
    onboarded: true,
    user: user,
  );

  Future<bool> saveProfile(ProfileDraft draft) async {
    if (state.busy) {
      return false;
    }
    final validation = ProfileDraft.validateName(draft.fullName);
    if (validation != null) {
      state = state.withStatus(error: validation);
      return false;
    }
    final generation = _generation;
    state = state.withStatus(busy: true);
    try {
      final user = await ref
          .read(sessionRepositoryProvider)
          .updateProfile(draft);
      if (generation != _generation) {
        return false;
      }
      _acceptUser(user);
      return true;
    } catch (error) {
      if (generation == _generation) {
        state = state.withStatus(error: _message(error));
      }
      return false;
    }
  }

  Future<void> expireSession() async {
    final generation = ++_generation;
    ref.read(apiClientProvider).token = null;
    // Clear user state synchronously; late API results cannot restore this user.
    state = const AuthState(
      phase: AuthPhase.signedOut,
      onboarded: true,
      busy: true,
      error: 'Your session has ended. Please sign in again.',
    );
    try {
      await ref.read(sessionStoreProvider).clearToken();
      if (generation == _generation) {
        state = state.withStatus(
          error: 'Your session has ended. Please sign in again.',
        );
      }
    } catch (_) {
      state = state.withStatus(
        error:
            'Session ended. Secure storage could not be cleared; please retry signing out.',
      );
    }
  }

  Future<void> revalidateSession() async {
    if (state.busy || state.user == null) {
      return;
    }
    final generation = _generation;
    state = state.withStatus(busy: true);
    try {
      final user = await ref.read(sessionRepositoryProvider).currentUser();
      if (generation == _generation) {
        _acceptUser(user);
      }
    } catch (error) {
      if (generation == _generation) {
        state = state.withStatus(error: _message(error));
      }
    }
  }

  Future<void> logout() async {
    if (state.busy) {
      return;
    }
    state = state.withStatus(busy: true);
    String? warning;
    try {
      await ref.read(sessionRepositoryProvider).signOut();
    } on ApiFailure catch (error) {
      if (error.status != 401) {
        warning =
            'Signed out on this device. We could not revoke the server session; it will expire automatically.';
      }
    } catch (_) {
      warning =
          'Signed out on this device. The server session will expire automatically.';
    }
    ++_generation;
    ref.read(apiClientProvider).token = null;
    try {
      await ref.read(sessionStoreProvider).clearToken();
    } catch (_) {
      warning =
          'Secure storage could not be cleared. Retry local sign-out before closing the app.';
    }
    state = AuthState(
      phase: AuthPhase.signedOut,
      onboarded: true,
      error: warning,
    );
  }
}
