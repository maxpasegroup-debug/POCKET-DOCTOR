# Storage boundary

Phase 1 SessionStore keeps tokens in OS-backed secure storage on Android/iOS.
The web validation target keeps tokens in memory only. Shared preferences contain
only onboarding completion and a sign-out marker, never identity or token data.
Storage failures are surfaced instead of falling back to insecure persistence.
