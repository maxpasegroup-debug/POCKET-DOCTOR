import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:pocket_doctor/features/membership/application/membership_providers.dart';
import 'package:pocket_doctor/features/membership/presentation/membership_screen.dart';
import 'package:pocket_doctor/features/membership/presentation/membership_checkout_screen.dart';
import 'package:pocket_doctor/features/membership/presentation/manage_membership_screen.dart';
import 'package:pocket_doctor/features/membership/presentation/transactions_screen.dart';
import '../helpers/membership_fakes.dart';

Future<void> mount(
  WidgetTester t,
  Widget screen,
  FakeMembershipRepository repo, {
  double textScale = 1,
}) async {
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/home',
        builder: (_, _) => const Scaffold(body: Text('Home destination')),
      ),
      GoRoute(path: '/', builder: (_, _) => screen),
      GoRoute(
        path: '/membership/confirmation',
        builder: (_, _) => const ManageMembershipScreen(confirmation: true),
      ),
      GoRoute(path: '/membership', builder: (_, _) => const MembershipScreen()),
    ],
  );
  addTearDown(router.dispose);
  await t.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [membershipRepositoryProvider.overrideWithValue(repo)],
      child: MaterialApp.router(
        routerConfig: router,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
      ),
    ),
  );
  await t.pumpAndSettle();
}

Future<void> tap(WidgetTester t, String text) async {
  final f = find.text(text).last;
  await t.ensureVisible(f);
  await t.tap(f);
  await t.pumpAndSettle();
}

void main() {
  testWidgets('confirmation provides a direct route back to Home', (t) async {
    await mount(
      t,
      const ManageMembershipScreen(confirmation: true),
      FakeMembershipRepository()..active = true,
    );
    await t.tap(find.byTooltip('Home'));
    await t.pumpAndSettle();
    expect(find.text('Home destination'), findsOneWidget);
  });
  testWidgets(
    'membership presents free account, backend prices, benefits and optional upgrade',
    (t) async {
      await mount(t, const MembershipScreen(), FakeMembershipRepository());
      expect(find.text('Your free account'), findsOneWidget);
      expect(find.text('₹199.00 / month'), findsOneWidget);
      expect(find.text('Selected demo programs'), findsOneWidget);
      expect(find.text('View plan'), findsOneWidget);
    },
  );
  testWidgets('membership empty and retryable connection error', (t) async {
    final repo = FakeMembershipRepository()..empty = true;
    await mount(t, const MembershipScreen(), repo);
    expect(find.textContaining('not available yet'), findsOneWidget);
    repo.fail = true;
    await mount(t, const MembershipScreen(), repo);
    expect(find.text('Try again'), findsWidgets);
  });
  testWidgets('plan details show billing and honest cancellation policy', (
    t,
  ) async {
    await mount(
      t,
      const MembershipPlanScreen(id: 'plan'),
      FakeMembershipRepository(),
    );
    expect(find.textContaining('No automatic debit'), findsOneWidget);
    expect(find.text('Review membership'), findsOneWidget);
  });
  testWidgets(
    'checkout coupon uses server result and keeps regular renewal price',
    (t) async {
      final repo = FakeMembershipRepository();
      await mount(t, const MembershipCheckoutScreen(id: 'plan'), repo);
      await t.enterText(find.byType(TextField), 'SAVE');
      await tap(t, 'Apply coupon');
      expect(repo.code, 'SAVE');
      expect(find.text('Due today: ₹159.20'), findsOneWidget);
      expect(find.text('Renewal price: ₹199.00 / month'), findsOneWidget);
    },
  );
  testWidgets(
    'payment success activates membership after repository verification',
    (t) async {
      final repo = FakeMembershipRepository();
      await mount(t, const MembershipCheckoutScreen(id: 'plan'), repo);
      await tap(t, 'Continue to payment');
      expect(repo.active, isFalse);
      await tap(t, 'Simulate successful payment');
      expect(repo.payments, 1);
      expect(find.text('Your membership is ready.'), findsOneWidget);
    },
  );
  testWidgets('payment failure never shows membership activation', (t) async {
    final repo = FakeMembershipRepository();
    await mount(t, const MembershipCheckoutScreen(id: 'plan'), repo);
    await tap(t, 'Continue to payment');
    await tap(t, 'Simulate failed payment');
    expect(repo.active, isFalse);
    expect(
      find.textContaining('Payment could not be completed'),
      findsOneWidget,
    );
  });
  testWidgets('cancellation has confirmation and retains period information', (
    t,
  ) async {
    final repo = FakeMembershipRepository()..active = true;
    await mount(t, const ManageMembershipScreen(), repo);
    await tap(t, 'Cancel membership');
    expect(find.text('Cancel membership?'), findsOneWidget);
    await tap(t, 'Cancel membership');
    expect(repo.cancellations, 1);
    expect(find.text('CANCELLED'), findsOneWidget);
    expect(find.textContaining('Cancellation is scheduled'), findsOneWidget);
  });
  testWidgets(
    'expired membership shows renewal choice without active benefits',
    (t) async {
      final repo = FakeMembershipRepository()
        ..active = true
        ..status = 'EXPIRED';
      await mount(t, const ManageMembershipScreen(), repo);
      expect(find.text('EXPIRED'), findsOneWidget);
      expect(find.text('Selected demo programs'), findsNothing);
      expect(find.text('Explore plans'), findsOneWidget);
    },
  );
  testWidgets('transaction history labels demo and invoice has no tax claim', (
    t,
  ) async {
    final repo = FakeMembershipRepository();
    await mount(t, const MembershipTransactionsScreen(), repo);
    expect(find.textContaining('No real charge'), findsOneWidget);
    await mount(t, const MembershipInvoiceScreen(id: 'invoice'), repo);
    expect(find.text('PD-DEMO-RECEIPT'), findsOneWidget);
    expect(find.textContaining('not a configured tax invoice'), findsOneWidget);
  });
  testWidgets(
    'small screen and large text membership layout does not overflow',
    (t) async {
      t.view.physicalSize = const Size(320, 640);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      await mount(
        t,
        const MembershipScreen(),
        FakeMembershipRepository(),
        textScale: 2,
      );
      expect(t.takeException(), isNull);
    },
  );
}
