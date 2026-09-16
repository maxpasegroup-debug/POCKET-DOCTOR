import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/routing/app_router.dart';
import '../../core/routing/app_routes.dart';
import '../auth/application/auth_controller.dart';
import '../consultation/application/consultation_providers.dart';
import 'realtime_providers.dart';

class PatientRealtimeNotice extends ConsumerWidget {
  const PatientRealtimeNotice({required this.child, super.key});
  final Widget child;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(doctorAvailabilityNoticeProvider, (previous, next) {
      if (next is! AsyncData || !context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('A new doctor is now available.'),
          action: SnackBarAction(
            label: 'View doctors',
            onPressed: () {
              ref.invalidate(doctorFiltersProvider);
              ref.read(appRouterProvider).go(AppRoutes.consultation);
            },
          ),
        ),
      );
    });
    ref.listen(currentUserProvider.select((user) => user?.id), (
      previous,
      next,
    ) {
      if (previous != null && next == null) {
        ScaffoldMessenger.of(context).clearSnackBars();
      }
    });
    return child;
  }
}
