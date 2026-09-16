import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/routing/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/application/auth_controller.dart';
import 'features/auth/presentation/splash_screen.dart';
import 'features/realtime/realtime_notice.dart';
import 'features/realtime/realtime_providers.dart';

class PocketDoctorApp extends ConsumerStatefulWidget {
  const PocketDoctorApp({super.key});
  @override
  ConsumerState<PocketDoctorApp> createState() => _PocketDoctorAppState();
}

class _PocketDoctorAppState extends ConsumerState<PocketDoctorApp>
    with WidgetsBindingObserver {
  Timer? _splashTimer;
  bool _showStartupSplash = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _splashTimer = Timer(const Duration(seconds: 2), () {
        if (mounted) setState(() => _showStartupSplash = false);
      });
    });
  }

  @override
  void dispose() {
    _splashTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.read(authProvider.notifier).revalidateSession();
      ref.read(patientRealtimeSessionProvider)?.connection.resume();
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      ref.read(patientRealtimeSessionProvider)?.connection.pause();
    }
  }

  @override
  Widget build(BuildContext context) => MaterialApp.router(
    title: 'Pocket Doctor',
    debugShowCheckedModeBanner: false,
    theme: AppTheme.light,
    routerConfig: ref.watch(appRouterProvider),
    // Session initialization continues through SplashScreen's auth provider.
    // Once this one-time display period ends, the router still waits for auth.
    builder: (context, child) => _showStartupSplash
        ? const SplashScreen()
        : PatientRealtimeNotice(child: child!),
  );
}
