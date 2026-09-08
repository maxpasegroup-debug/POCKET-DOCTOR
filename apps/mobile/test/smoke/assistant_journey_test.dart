import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_doctor/core/config/app_config.dart';
import 'package:pocket_doctor/core/storage/session_store.dart';
import 'package:pocket_doctor/features/auth/application/auth_controller.dart';
import 'package:pocket_doctor/features/assistant/application/assistant_providers.dart';
import 'package:pocket_doctor/features/assistant/domain/assistant_models.dart';
import '../helpers/auth_fakes.dart';

void main() {
  test(
    'real assistant API: consent, chat, memory, goals, check-in, reminders and deletion',
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
      final repo = c.read(assistantRepositoryProvider);
      await repo.savePreferences({
        for (final key in assistantPreferenceLabels.keys) key: true,
      });
      final id = await repo.createConversation();
      final key = assistantRequestKey();
      await repo.send(id, 'Help me build a routine', key);
      await repo.send(id, 'Help me build a routine', key);
      expect((await repo.conversation(id)).messages.length, 1);
      await repo.send(
        id,
        'Can you prescribe medication?',
        assistantRequestKey(),
      );
      expect(
        (await repo.conversation(id)).messages.last.reply.classification,
        'doctor',
      );
      await repo.saveRecord(WellnessRecordKind.memory, {
        'text': 'DEMO evening routine',
      });
      expect((await repo.records(WellnessRecordKind.memory, 1)).length, 1);
      await repo.saveRecord(WellnessRecordKind.goals, {
        'title': 'DEMO daily routine',
        'target': 'My chosen habit',
        'startDate': DateTime.now().toIso8601String().substring(0, 10),
      });
      expect((await repo.records(WellnessRecordKind.goals, 1)).length, 1);
      await repo.saveRecord(WellnessRecordKind.checkIns, {
        'date': DateTime.now().toIso8601String().substring(0, 10),
        'mood': 'Okay',
        'energy': 3,
      });
      expect((await repo.records(WellnessRecordKind.checkIns, 1)).length, 1);
      await repo.saveRecord(WellnessRecordKind.reminders, {
        'title': 'DEMO reflection',
        'kind': 'PERSONAL',
        'dueAt': DateTime.now()
            .add(const Duration(hours: 1))
            .toUtc()
            .toIso8601String(),
      });
      expect((await repo.records(WellnessRecordKind.reminders, 1)).length, 1);
      await repo.clearMemory();
      expect(await repo.records(WellnessRecordKind.memory, 1), isEmpty);
      await repo.deleteConversation(id);
      expect(await repo.conversations(1), isEmpty);
      await auth.logout();
    },
    skip: !const bool.fromEnvironment('RUN_ASSISTANT_SMOKE'),
  );
}
