import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_doctor/core/config/app_config.dart';
import 'package:pocket_doctor/core/networking/api_client.dart';
import 'package:pocket_doctor/core/storage/session_store.dart';
import 'package:pocket_doctor/features/auth/application/auth_controller.dart';
import 'package:pocket_doctor/features/programs/application/program_providers.dart';
import '../helpers/auth_fakes.dart';

void main() {
  test(
    'real program API: discover, free/paid enroll, lesson resume and completion',
    () async {
      final config = AppConfig.fromEnvironment();
      expect(['localhost', '127.0.0.1'].contains(config.apiBaseUri.host), true);
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
      await auth.verifyOtp(
        container.read(authProvider).challenge!.developmentCode!,
      );
      final repo = container.read(programRepositoryProvider);
      final categories = await repo.categories();
      expect(categories, isNotEmpty);
      final programs = await repo.discover({'q': 'Weight Management'});
      expect(programs.programs, isNotEmpty);
      final free = programs.programs.firstWhere(
        (p) => !p.isLive && p.pricePaise == 0,
      );
      final detail = await repo.detail(free.id);
      expect(detail.modules, isNotEmpty);
      await repo.enroll(free.id);
      await repo.enroll(free.id);
      final lessonId = detail.modules.first.lessons.first.id;
      await repo.progress(free.id, lessonId, 2, false);
      expect((await repo.lesson(free.id, lessonId)).positionSeconds, 2);
      for (final module in detail.modules) {
        for (final lesson in module.lessons) {
          await repo.progress(free.id, lesson.id, 0, true);
        }
      }
      expect((await repo.overview(free.id)).completed, true);
      final paid = (await repo.discover({'price': 'paid'})).programs.first;
      await expectLater(repo.enroll(paid.id), throwsA(isA<ApiFailure>()));
      final payment = await repo.payment(paid.id);
      expect(payment.mode, 'development');
      expect(await repo.settle(payment.id, true), true);
      expect((await repo.mine()).length, 2);
      final live = (await repo.discover({'type': 'LIVE'})).programs.first;
      await repo.enroll(live.id);
      expect((await repo.overview(live.id)).program.liveSessions, isNotEmpty);
      await auth.logout();
      await expectLater(repo.mine(), throwsA(isA<ApiFailure>()));
    },
    skip: !const bool.fromEnvironment('RUN_PROGRAM_SMOKE'),
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
