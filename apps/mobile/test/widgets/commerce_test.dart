import '../helpers/membership_fakes.dart';
import 'package:pocket_doctor/features/membership/application/membership_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_doctor/app.dart';
import 'package:pocket_doctor/core/routing/app_router.dart';
import 'package:pocket_doctor/features/auth/application/auth_controller.dart';
import 'package:pocket_doctor/features/auth/domain/auth_models.dart';
import 'package:pocket_doctor/features/programs/application/program_providers.dart';
import 'package:pocket_doctor/features/consultation/application/consultation_providers.dart';
import 'package:pocket_doctor/features/wellness/application/commerce_providers.dart';
import 'package:pocket_doctor/features/wellness/domain/commerce_models.dart';
import 'package:pocket_doctor/features/wellness/presentation/commerce_widgets.dart';
import '../helpers/auth_fakes.dart';
import '../helpers/program_fakes.dart';
import '../helpers/consultation_fakes.dart';
import '../helpers/commerce_fakes.dart';

void main() {
  Future<ProviderContainer> start(
    WidgetTester tester,
    FakeCommerceRepository repository, {
    String path = '/wellness',
    double width = 390,
  }) async {
    tester.view.physicalSize = Size(width, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final container = ProviderContainer(
      overrides: [
        membershipRepositoryProvider.overrideWithValue(
          FakeMembershipRepository(),
        ),
        authProvider.overrideWith(
          () => ReadyAuthController(
            const AuthState(
              phase: AuthPhase.signedIn,
              user: testUser,
              onboarded: true,
            ),
          ),
        ),
        commerceRepositoryProvider.overrideWithValue(repository),
        consultationRepositoryProvider.overrideWithValue(
          FakeConsultationRepository(empty: true),
        ),
        programRepositoryProvider.overrideWithValue(
          FakeProgramRepository(empty: true),
        ),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const PocketDoctorApp(),
      ),
    );
    container.read(appRouterProvider).go(path);
    await tester.pumpAndSettle();
    return container;
  }

  Future<void> tap(WidgetTester tester, String text) async {
    final f = find.text(text).last;
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
    await tester.tap(f);
    await tester.pumpAndSettle();
  }

  testWidgets('catalogue search, clear, category and price filters', (
    tester,
  ) async {
    final repo = FakeCommerceRepository();
    await start(tester, repo);
    expect(find.byType(WellnessProductCard), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'unknown');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(find.text('No products found'), findsOneWidget);
    expect(repo.lastQuery['q'], 'unknown');
    await tester.ensureVisible(find.byTooltip('Clear search'));
    await tester.tap(find.byTooltip('Clear search'));
    await tester.pumpAndSettle();
    await tap(tester, 'Daily Wellness');
    expect(repo.lastQuery['category'], 'daily');
    await tap(tester, 'Filters & sorting');
    await tap(tester, 'Under INR 500');
    expect(repo.lastQuery['maxPrice'], '50000');
  });
  testWidgets(
    'product details add to cart, quantity, price changes and remove',
    (tester) async {
      final repo = FakeCommerceRepository()..priceChanged = true;
      await start(tester, repo, path: '/products/product');
      expect(find.text('Sample usage'), findsOneWidget);
      await tap(tester, 'Add to cart');
      expect(repo.quantity, 1);
      expect(find.textContaining('Price updated'), findsOneWidget);
      await tester.ensureVisible(find.byTooltip('Increase quantity'));
      await tester.tap(find.byTooltip('Increase quantity'));
      await tester.pumpAndSettle();
      expect(repo.quantity, 2);
      await tap(tester, 'Remove');
      expect(find.text('Your cart is empty'), findsOneWidget);
    },
  );
  testWidgets('unavailable cart prevents checkout', (tester) async {
    final repo = FakeCommerceRepository()
      ..quantity = 1
      ..available = false;
    await start(tester, repo, path: '/cart');
    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Continue to checkout'),
    );
    expect(button.onPressed, isNull);
    expect(find.textContaining('Availability changed'), findsOneWidget);
  });
  testWidgets('address form validation, save, edit and delete', (tester) async {
    final repo = FakeCommerceRepository();
    await start(tester, repo, path: '/addresses');
    await tap(tester, 'Add address');
    await tap(tester, 'Save address');
    expect(find.text('Please enter full name.'), findsOneWidget);
    final values = [
      'DEMO Recipient',
      '+919999900404',
      'Test address',
      '',
      'Test city',
      'Test state',
      '560001',
    ];
    for (var i = 0; i < values.length; i++) {
      await tester.enterText(find.byType(TextFormField).at(i), values[i]);
    }
    await tap(tester, 'Save address');
    expect(repo.saved.length, 1);
    await tap(tester, 'Edit');
    await tester.enterText(find.byType(TextFormField).first, 'DEMO Updated');
    await tap(tester, 'Save address');
    expect(repo.saved.first.fullName, 'DEMO Updated');
    await tap(tester, 'Delete');
    await tap(tester, 'Delete');
    expect(repo.saved, isEmpty);
  });
  testWidgets('checkout requires address and displays server totals', (
    tester,
  ) async {
    final repo = FakeCommerceRepository()..quantity = 1;
    final container = await start(tester, repo, path: '/checkout');
    expect(find.text('Add a delivery address'), findsOneWidget);
    expect(find.text('Place order'), findsNothing);
    repo.saved.add(DeliveryAddress.fromJson(demoAddressJson));
    container.invalidate(addressesProvider);
    await tester.pumpAndSettle();
    expect(find.text('Total: INR 400.00'), findsOneWidget);
    await tap(tester, 'Place order');
    expect(find.text('Your order'), findsOneWidget);
    expect(repo.status, 'PENDING_PAYMENT');
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
    'payment survives delayed detail polling and confirms only after settlement',
    (tester) async {
      final repo = FakeCommerceRepository()
        ..status = 'PENDING_PAYMENT'
        ..delay = const Duration(milliseconds: 200);
      await start(tester, repo, path: '/orders/order');
      expect(find.text('Demo order confirmed'), findsNothing);
      await tap(tester, 'Continue to payment');
      await tester.pump(const Duration(seconds: 31));
      await tester.pumpAndSettle();
      await tap(tester, 'Simulate payment');
      expect(repo.status, 'CONFIRMED');
      expect(find.text('Demo order confirmed'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('payment failure, tracking and cancellation refund messaging', (
    tester,
  ) async {
    final repo = FakeCommerceRepository()..status = 'PENDING_PAYMENT';
    final container = await start(tester, repo, path: '/orders/order');
    await tap(tester, 'Continue to payment');
    await tap(tester, 'Simulate failure');
    expect(find.text('Return to cart'), findsOneWidget);
    repo.status = 'CONFIRMED';
    container.invalidate(wellnessOrderProvider('order'));
    await tester.pumpAndSettle();
    await tap(tester, 'Cancel order');
    await tap(tester, 'Cancel order');
    expect(repo.status, 'CANCELLED');
    expect(find.text('requested'), findsOneWidget);
    expect(find.text('Order tracking'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('order history empty state and profile route', (tester) async {
    final container = await start(
      tester,
      FakeCommerceRepository(),
      path: '/profile',
    );
    await tap(tester, 'My Orders');
    expect(find.text('No orders yet'), findsOneWidget);
    container.read(appRouterProvider).pop();
    await tester.pumpAndSettle();
    expect(find.text('Health, on your terms.'), findsOneWidget);
  });
  testWidgets('network errors retry and narrow layout', (tester) async {
    final repo = FakeCommerceRepository()..fail = true;
    await start(tester, repo, width: 320);
    expect(find.textContaining('Connection interrupted'), findsWidgets);
    repo.fail = false;
    await tap(tester, 'Try again');
    expect(tester.takeException(), isNull);
  });
  test(
    'commerce routes stay protected and checkout keys are valid and unique',
    () {
      for (final path in [
        '/wellness',
        '/cart',
        '/addresses',
        '/checkout',
        '/orders/order',
      ]) {
        expect(
          authRedirect(
            const AuthState(phase: AuthPhase.signedOut, onboarded: true),
            path,
          ),
          '/login',
        );
      }
      final a = checkoutKey();
      expect(
        a,
        matches(
          RegExp(
            r'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',
          ),
        ),
      );
      expect(checkoutKey(), isNot(a));
    },
  );
}
