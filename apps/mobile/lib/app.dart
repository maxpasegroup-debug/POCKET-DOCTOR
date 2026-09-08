import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/routing/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/application/auth_controller.dart';

class PocketDoctorApp extends ConsumerStatefulWidget {
  const PocketDoctorApp({super.key});
  @override
  ConsumerState<PocketDoctorApp> createState() => _PocketDoctorAppState();
}

class _PocketDoctorAppState extends ConsumerState<PocketDoctorApp>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.read(authProvider.notifier).revalidateSession();
    }
  }

  @override
  Widget build(BuildContext context) => MaterialApp.router(
    title: 'Pocket Doctor',
    debugShowCheckedModeBanner: false,
    theme: AppTheme.light,
    routerConfig: ref.watch(appRouterProvider),
  );
}
