import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_doctor/core/config/app_config.dart';
import 'package:pocket_doctor/core/networking/api_client.dart';
import 'package:pocket_doctor/core/storage/session_store.dart';
import 'package:pocket_doctor/features/auth/application/auth_controller.dart';
import 'package:pocket_doctor/features/consultation/application/consultation_providers.dart';
import '../helpers/auth_fakes.dart';

void main() {
  test(
    'real consultation API: discover, reserve, pay, restore, reschedule, cancel and logout',
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
      expect(
        container.read(authProvider).challenge,
        isNotNull,
        reason: '${container.read(authProvider).error}',
      );
      await auth.verifyOtp(
        container.read(authProvider).challenge!.developmentCode!,
      );
      final repository = container.read(consultationRepositoryProvider);
      final doctors = await repository.discover({'q': 'DEMO'});
      expect(doctors.doctors, isNotEmpty);
      final doctor = doctors.doctors.first;
      expect(doctor.isDemo, true);
      expect(doctor.verified, false);
      expect(await repository.specialties(), contains(doctor.specialty));
      final date = DateTime.now()
          .toUtc()
          .add(const Duration(days: 2))
          .toIso8601String()
          .substring(0, 10);
      final slots = await repository.slots(doctor.id, date);
      expect(slots.length, greaterThan(1));
      final booking = await repository.book(doctor.id, date, slots.first);
      expect(booking.status, 'PENDING_PAYMENT');
      final payment = await repository.payment(booking.id);
      expect(payment.mode, 'development');
      final confirmed = await repository.settle(payment.id, true);
      expect(confirmed.status, 'CONFIRMED');
      expect((await repository.detail(booking.id)).paymentStatus, 'VERIFIED');
      expect((await repository.mine()).any((a) => a.id == booking.id), true);
      final changed = await repository.reschedule(booking.id, date, slots.last);
      expect(changed.startsAt, slots.last.startsAt);
      expect((await repository.cancel(booking.id)).status, 'CANCELLED');
      await auth.logout();
      await expectLater(repository.mine(), throwsA(isA<ApiFailure>()));
    },
    skip: !const bool.fromEnvironment('RUN_CONSULTATION_SMOKE'),
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
