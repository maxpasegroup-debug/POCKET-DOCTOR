import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_doctor/core/config/app_config.dart';
import 'package:pocket_doctor/core/networking/api_client.dart';
import 'package:pocket_doctor/core/storage/session_store.dart';
import 'package:pocket_doctor/features/auth/application/auth_controller.dart';
import 'package:pocket_doctor/features/wellness/application/commerce_providers.dart';
import '../helpers/auth_fakes.dart';

void main() {
  test(
    'real commerce API: catalogue, cart, address, checkout, payment, history and cancellation',
    () async {
      expect(
        [
          'localhost',
          '127.0.0.1',
        ].contains(AppConfig.fromEnvironment().apiBaseUri.host),
        true,
      );
      final container = ProviderContainer(
        overrides: [
          sessionStoreProvider.overrideWithValue(MemorySessionStore()),
        ],
      );
      addTearDown(container.dispose);
      final auth = container.read(authProvider.notifier);
      await Future<void>.delayed(Duration.zero);
      await auth.finishOnboarding();
      await auth.requestOtp(
        '+919${Random.secure().nextInt(1000000000).toString().padLeft(9, '0')}',
      );
      expect(container.read(authProvider).challenge, isNotNull);
      await auth.verifyOtp(
        container.read(authProvider).challenge!.developmentCode!,
      );
      final repo = container.read(commerceRepositoryProvider);
      final products = await repo.discover({'q': 'DEMO'});
      expect(products.products, isNotEmpty);
      final p = products.products.first;
      expect(p.isDemo, true);
      expect((await repo.product(p.id)).warnings, isNotEmpty);
      expect(await repo.categories(), isNotEmpty);
      expect((await repo.setCart(p.id, 1)).items.length, 1);
      final address = await repo.saveAddress({
        'fullName': 'DEMO Smoke Recipient',
        'phone': '+919999900404',
        'line1': 'DEMO test address',
        'line2': '',
        'city': 'Test city',
        'state': 'Test state',
        'pinCode': '560001',
        'country': 'IN',
        'isDefault': true,
      });
      final quote = await repo.checkout(address.id);
      expect(quote.isDemo, true);
      expect(quote.totalPaise, p.pricePaise + quote.deliveryPaise);
      final key = checkoutKey();
      final order = await repo.createOrder(address.id, quote.quote, key);
      expect(
        (await repo.createOrder(address.id, quote.quote, key)).id,
        order.id,
      );
      final payment = await repo.payment(order.id);
      expect(payment.mode, 'development');
      expect((await repo.settle(payment.id, true)).status, 'CONFIRMED');
      expect((await repo.settle(payment.id, true)).status, 'CONFIRMED');
      expect((await repo.orders(1)).orders.any((o) => o.id == order.id), true);
      expect((await repo.order(order.id)).address.line1, 'DEMO test address');
      expect((await repo.cancel(order.id)).refundStatus, 'REQUESTED');
      await repo.deleteAddress(address.id);
      await auth.logout();
      await expectLater(repo.orders(1), throwsA(isA<ApiFailure>()));
    },
    skip: !const bool.fromEnvironment('RUN_COMMERCE_SMOKE'),
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
