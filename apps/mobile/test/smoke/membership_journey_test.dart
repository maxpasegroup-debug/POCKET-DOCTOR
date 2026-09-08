import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_doctor/core/config/app_config.dart';
import 'package:pocket_doctor/core/storage/session_store.dart';
import 'package:pocket_doctor/features/auth/application/auth_controller.dart';
import 'package:pocket_doctor/features/assistant/application/assistant_providers.dart';
import 'package:pocket_doctor/features/membership/application/membership_providers.dart';
import '../helpers/auth_fakes.dart';

void main() {
  test(
    'real membership API: free account, verified demo payment, receipt, cancel, reactivate, logout',
    () async {
      expect(
        [
          'localhost',
          '127.0.0.1',
        ].contains(AppConfig.fromEnvironment().apiBaseUri.host),
        isTrue,
      );
      final c = ProviderContainer(
        overrides: [
          sessionStoreProvider.overrideWithValue(MemorySessionStore()),
        ],
      );
      addTearDown(c.dispose);
      final auth = c.read(authProvider.notifier);
      await Future<void>.delayed(Duration.zero);
      await auth.finishOnboarding();
      await auth.requestOtp(
        '+919${Random.secure().nextInt(1000000000).toString().padLeft(9, '0')}',
      );
      await auth.verifyOtp(c.read(authProvider).challenge!.developmentCode!);
      final r = c.read(membershipRepositoryProvider);
      expect((await r.current()).entitled, isFalse);
      final plans = await r.plans();
      final plan = plans.firstWhere(
        (p) => p.data['slug'] == 'demo-pocket-doctor-plus-month',
      );
      final quote = await r.quote(plan.id, '');
      expect(quote.amount, plan.price);
      final checkout = await r.subscribe(plan.id, '', assistantRequestKey());
      expect((await r.current()).entitled, isFalse);
      expect(await r.settle(checkout.paymentId!, true), isTrue);
      expect(await r.settle(checkout.paymentId!, true), isTrue);
      expect((await r.current()).entitled, isTrue);
      final history = await r.transactions(1);
      expect(history.length, 1);
      final invoice = await r.invoice(
        (history.first['invoice'] as Map)['id'] as String,
      );
      expect(invoice['amountPaise'], quote.amount);
      await r.manage(checkout.subscription.id, false);
      expect((await r.current()).subscription!.status, 'CANCELLED');
      expect((await r.current()).entitled, isTrue);
      await r.manage(checkout.subscription.id, true);
      expect((await r.current()).subscription!.status, 'ACTIVE');
      await auth.logout();
    },
    skip: !const bool.fromEnvironment('RUN_MEMBERSHIP_SMOKE'),
  );
}
