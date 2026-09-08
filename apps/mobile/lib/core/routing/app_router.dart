import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/privacy/presentation/privacy_screen.dart';
import '../../features/auth/application/auth_controller.dart';
import '../../features/auth/domain/auth_models.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/otp_screen.dart';
import '../../features/auth/presentation/splash_screen.dart';
import '../../features/auth/presentation/welcome_screen.dart';
import '../../features/assistant/presentation/assistant_screen.dart';
import '../../features/assistant/presentation/chat_screen.dart';
import '../../features/assistant/presentation/wellness_records_screen.dart';
import '../../features/assistant/presentation/assistant_settings_screen.dart';
import '../../features/assistant/domain/assistant_models.dart';
import '../../features/consultation/presentation/consultation_screen.dart';
import '../../features/consultation/presentation/doctor_profile_screen.dart';
import '../../features/consultation/presentation/booking_screen.dart';
import '../../features/consultation/presentation/appointment_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../../features/profile/presentation/profile_setup_screen.dart';
import '../../features/health/presentation/health_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/programs/presentation/programs_screen.dart';
import '../../features/programs/presentation/program_detail_screen.dart';
import '../../features/programs/presentation/program_overview_screen.dart';
import '../../features/programs/presentation/lesson_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../../features/wellness/presentation/wellness_screen.dart';
import '../../features/wellness/presentation/product_screen.dart';
import '../../features/wellness/presentation/cart_screen.dart';
import '../../features/wellness/presentation/address_screen.dart';
import '../../features/wellness/presentation/checkout_screen.dart';
import '../../features/wellness/presentation/orders_screen.dart';
import '../../shared/widgets/app_shell.dart';
import 'app_routes.dart';
import '../../features/membership/presentation/membership_screen.dart';
import '../../features/membership/presentation/membership_checkout_screen.dart';
import '../../features/membership/presentation/manage_membership_screen.dart';
import '../../features/membership/presentation/transactions_screen.dart';

class _RouterRefresh extends ChangeNotifier {
  void refresh() => notifyListeners();
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh();
  ref.listen(authProvider, (_, _) => refresh.refresh());
  final router = createAppRouter(
    readAuth: () => ref.read(authProvider),
    refreshListenable: refresh,
  );
  ref.onDispose(() {
    router.dispose();
    refresh.dispose();
  });
  return router;
});

String? authRedirect(AuthState auth, String path) {
  final target = switch (auth.phase) {
    AuthPhase.initializing => '/splash',
    AuthPhase.signedOut => auth.onboarded ? '/login' : '/welcome',
    AuthPhase.otp => '/otp',
    AuthPhase.profileRequired => '/profile/setup',
    AuthPhase.signedIn => null,
  };
  if (target != null) {
    return path == target ? null : target;
  }
  if ([
    '/',
    '/splash',
    '/welcome',
    '/login',
    '/otp',
    '/profile/setup',
  ].contains(path)) {
    return '/home';
  }
  return null;
}

GoRouter createAppRouter({
  required AuthState Function() readAuth,
  Listenable? refreshListenable,
  String initialLocation = AppRoutes.splash,
}) => GoRouter(
  initialLocation: initialLocation,
  refreshListenable: refreshListenable,
  redirect: (context, state) => authRedirect(readAuth(), state.uri.path),
  routes: [
    GoRoute(path: '/membership', builder: (_, _) => const MembershipScreen()),
    GoRoute(
      path: '/membership/plans/:id',
      builder: (_, s) => MembershipPlanScreen(id: s.pathParameters['id']!),
    ),
    GoRoute(
      path: '/membership/checkout/:id',
      builder: (_, s) => MembershipCheckoutScreen(
        id: s.pathParameters['id']!,
        renew: s.uri.queryParameters['renew'] == 'true',
      ),
    ),
    GoRoute(
      path: '/membership/manage',
      builder: (_, _) => const ManageMembershipScreen(),
    ),
    GoRoute(
      path: '/membership/confirmation',
      builder: (_, _) => const ManageMembershipScreen(confirmation: true),
    ),
    GoRoute(
      path: '/membership/transactions',
      builder: (_, _) => const MembershipTransactionsScreen(),
    ),
    GoRoute(
      path: '/membership/invoices/:id',
      builder: (_, s) => MembershipInvoiceScreen(id: s.pathParameters['id']!),
    ),
    GoRoute(path: '/', redirect: (_, _) => '/splash'),
    GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
    GoRoute(path: '/welcome', builder: (_, _) => const WelcomeScreen()),
    GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
    GoRoute(path: '/otp', builder: (_, _) => const OtpScreen()),
    GoRoute(
      path: '/profile/setup',
      builder: (_, _) => const ProfileSetupScreen(),
    ),
    GoRoute(
      path: '/profile/edit',
      builder: (_, _) => const ProfileSetupScreen(editing: true),
    ),
    GoRoute(path: '/consultation', redirect: (_, _) => '/consult'),
    GoRoute(path: '/doctors', redirect: (_, _) => '/consult'),
    GoRoute(
      path: '/doctors/:id',
      builder: (_, state) =>
          DoctorProfileScreen(id: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/doctors/:id/book',
      builder: (_, state) => BookingScreen(
        doctorId: state.pathParameters['id']!,
        rescheduleId: state.uri.queryParameters['reschedule'],
      ),
    ),
    GoRoute(
      path: '/consultation/:id',
      builder: (_, state) => AppointmentScreen(id: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/consultation/:id/confirmation',
      builder: (_, state) => AppointmentScreen(
        id: state.pathParameters['id']!,
        confirmation: true,
      ),
    ),
    GoRoute(path: '/shop', redirect: (_, _) => '/wellness'),
    GoRoute(path: '/wellness', builder: (_, _) => const WellnessScreen()),
    GoRoute(
      path: '/products/:id',
      builder: (_, s) => WellnessProductScreen(id: s.pathParameters['id']!),
    ),
    GoRoute(path: '/cart', builder: (_, _) => const WellnessCartScreen()),
    GoRoute(path: '/addresses', builder: (_, _) => const AddressScreen()),
    GoRoute(path: '/checkout', builder: (_, _) => const CheckoutScreen()),
    GoRoute(path: '/orders', builder: (_, _) => const OrdersScreen()),
    GoRoute(
      path: '/orders/:id',
      builder: (_, s) => WellnessOrderScreen(id: s.pathParameters['id']!),
    ),
    GoRoute(
      path: '/programs/:id',
      builder: (_, state) =>
          ProgramDetailScreen(id: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/my-programs',
      builder: (_, _) => Scaffold(
        appBar: AppBar(title: const Text('My Programs')),
        body: const ProgramsScreen(myPrograms: true),
      ),
    ),
    GoRoute(
      path: '/my-programs/:id',
      builder: (_, state) =>
          ProgramOverviewScreen(id: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/my-programs/:id/lessons/:lessonId',
      builder: (_, state) => LessonScreen(
        programId: state.pathParameters['id']!,
        lessonId: state.pathParameters['lessonId']!,
      ),
    ),
    GoRoute(path: '/health', builder: (_, _) => const HealthScreen()),
    GoRoute(
      path: '/my-consultations',
      builder: (_, _) => Scaffold(
        appBar: AppBar(title: const Text('My Consultations')),
        body: const ConsultationScreen(initialTab: 1),
      ),
    ),
    GoRoute(
      path: '/assistant/history',
      builder: (_, _) => const AssistantHistoryScreen(),
    ),
    GoRoute(
      path: '/assistant/chat/:id',
      builder: (_, s) => AssistantChatScreen(id: s.pathParameters['id']!),
    ),
    for (final kind in WellnessRecordKind.values)
      GoRoute(
        path: kind.route,
        builder: (_, _) => WellnessRecordsScreen(kind: kind),
      ),
    GoRoute(
      path: '/assistant/settings',
      builder: (_, _) => const AssistantSettingsScreen(),
    ),
    GoRoute(
      path: '/assistant/whatsapp',
      builder: (_, _) => const WhatsAppLinkScreen(),
    ),
    GoRoute(path: '/settings', builder: (_, _) => const SettingsScreen()),
    GoRoute(
      path: '/notifications',
      builder: (_, _) => const NotificationsScreen(),
    ),
    GoRoute(
      path: '/settings/privacy',
      builder: (_, _) => const PrivacyScreen(),
    ),
    GoRoute(
      path: '/settings/export',
      builder: (_, _) => const PrivacyExportScreen(),
    ),
    for (final kind in ['terms', 'help'])
      GoRoute(
        path: '/settings/$kind',
        builder: (_, _) => InformationScreen(kind: kind),
      ),
    StatefulShellRoute.indexedStack(
      builder: (_, _, shell) => AppShell(navigationShell: shell),
      branches: [
        _branch('/home', const HomeScreen()),
        _branch('/programs', const ProgramsScreen()),
        _branch('/consult', const ConsultationScreen()),
        _branch('/assistant', const AssistantScreen()),
        _branch('/profile', const ProfileScreen()),
      ],
    ),
  ],
  errorBuilder: (context, state) => Scaffold(
    body: SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('This page is not available yet.'),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: () => context.go('/home'),
                child: const Text('Go to Home'),
              ),
            ],
          ),
        ),
      ),
    ),
  ),
);

StatefulShellBranch _branch(String path, Widget screen) => StatefulShellBranch(
  routes: [GoRoute(path: path, builder: (_, _) => screen)],
);
