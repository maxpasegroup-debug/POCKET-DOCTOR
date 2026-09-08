import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:pocket_doctor/features/assistant/application/assistant_providers.dart';
import 'package:pocket_doctor/features/assistant/domain/assistant_models.dart';
import 'package:pocket_doctor/features/assistant/presentation/assistant_screen.dart';
import 'package:pocket_doctor/features/assistant/presentation/assistant_settings_screen.dart';
import 'package:pocket_doctor/features/assistant/presentation/chat_screen.dart';
import 'package:pocket_doctor/features/assistant/presentation/wellness_records_screen.dart';
import '../helpers/assistant_fakes.dart';

Future<void> mount(
  WidgetTester t,
  Widget screen,
  FakeAssistantRepository repo,
) async {
  await t.pumpWidget(
    ProviderScope(
      overrides: [assistantRepositoryProvider.overrideWithValue(repo)],
      child: MaterialApp(home: Scaffold(body: screen)),
    ),
  );
  await t.pumpAndSettle();
}

void main() {
  test('assistant routes reject external and privileged destinations', () {
    expect(validAssistantRoute('/orders/abc'), isTrue);
    expect(validAssistantRoute('https://external.example'), isFalse);
    expect(validAssistantRoute('/admin'), isFalse);
    expect(validAssistantRoute('/orders/../../admin'), isFalse);
    expect(assistantRequestKey(), isNot(assistantRequestKey()));
  });
  testWidgets(
    'assistant greets, shows four service navigation and honest demo',
    (t) async {
      await mount(t, const AssistantScreen(), FakeAssistantRepository());
      expect(find.text('Your personal health companion.'), findsOneWidget);
      expect(find.text('My Programs'), findsOneWidget);
      expect(find.text('My Consultations'), findsOneWidget);
      expect(find.text('My Orders'), findsOneWidget);
      expect(find.textContaining('Local demo assistant'), findsOneWidget);
    },
  );
  testWidgets('chat loading state', (t) async {
    final pending = Completer<AssistantConversation>();
    await t.pumpWidget(
      ProviderScope(
        overrides: [
          assistantRepositoryProvider.overrideWithValue(
            FakeAssistantRepository(),
          ),
          assistantChatProvider('chat').overrideWith((ref) => pending.future),
        ],
        child: const MaterialApp(home: AssistantChatScreen(id: 'chat')),
      ),
    );
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    pending.complete(AssistantConversation('chat', DateTime.now(), []));
    await t.pumpAndSettle();
    expect(find.text('Let’s start with you.'), findsOneWidget);
  });
  testWidgets('chat send, safe response and doctor escalation navigation', (
    t,
  ) async {
    final repo = FakeAssistantRepository();
    final router = GoRouter(
      initialLocation: '/chat',
      routes: [
        GoRoute(
          path: '/chat',
          builder: (_, _) => const AssistantChatScreen(id: 'chat'),
        ),
        GoRoute(
          path: '/consult',
          builder: (_, _) => const Scaffold(body: Text('Doctor discovery')),
        ),
      ],
    );
    addTearDown(router.dispose);
    await t.pumpWidget(
      ProviderScope(
        overrides: [assistantRepositoryProvider.overrideWithValue(repo)],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField), 'Can you diagnose me?');
    await t.ensureVisible(find.text('Send message'));
    await t.tap(find.text('Send message'));
    await t.pumpAndSettle();
    expect(repo.sends, 1);
    expect(find.textContaining('A qualified doctor'), findsOneWidget);
    await t.ensureVisible(find.text('Talk to a Doctor'));
    await t.tap(find.text('Talk to a Doctor'));
    await t.pumpAndSettle();
    expect(find.text('Doctor discovery'), findsOneWidget);
  });
  testWidgets('chat error preserves draft and retry succeeds', (t) async {
    final repo = FakeAssistantRepository();
    await mount(t, const AssistantChatScreen(id: 'chat'), repo);
    repo.fail = true;
    await t.enterText(find.byType(TextField), 'Hello');
    await t.ensureVisible(find.text('Send message'));
    await t.tap(find.text('Send message'));
    await t.pumpAndSettle();
    expect(find.textContaining('Could not connect'), findsWidgets);
    expect(find.text('Hello'), findsOneWidget);
    repo.fail = false;
    await t.ensureVisible(find.text('Send message'));
    await t.tap(find.text('Send message'));
    await t.pumpAndSettle();
    expect(repo.sends, 1);
  });
  testWidgets('history deletion confirms and reaches empty state', (t) async {
    final repo = FakeAssistantRepository(empty: false);
    await mount(t, const AssistantHistoryScreen(), repo);
    await t.tap(find.byTooltip('Delete conversation'));
    await t.pumpAndSettle();
    await t.tap(find.text('Delete'));
    await t.pumpAndSettle();
    expect(repo.deletes, 1);
    expect(find.text('No conversations yet.'), findsOneWidget);
  });
  for (final kind in WellnessRecordKind.values) {
    testWidgets('${kind.name} renders saved data, delete, empty and errors', (
      t,
    ) async {
      final repo = FakeAssistantRepository(empty: false);
      await mount(t, WellnessRecordsScreen(kind: kind), repo);
      expect(find.text('Edit'), findsOneWidget);
      await t.ensureVisible(find.text('Delete'));
      await t.tap(find.text('Delete'));
      await t.pumpAndSettle();
      await t.tap(find.widgetWithText(FilledButton, 'Delete'));
      await t.pumpAndSettle();
      expect(repo.deletes, 1);
      expect(
        find.text('Nothing saved yet. Start when you are ready.'),
        findsOneWidget,
      );
      await t.pumpWidget(const SizedBox());
      repo.fail = true;
      await mount(t, WellnessRecordsScreen(kind: kind), repo);
      expect(find.textContaining('Could not connect'), findsOneWidget);
    });
  }
  testWidgets('goal validates required fields and saves after completion', (
    t,
  ) async {
    final repo = FakeAssistantRepository();
    await mount(
      t,
      const WellnessRecordEditor(kind: WellnessRecordKind.goals),
      repo,
    );
    await t.ensureVisible(find.text('Save'));
    await t.tap(find.text('Save'));
    await t.pumpAndSettle();
    expect(repo.saves, 0);
    await t.enterText(find.byType(TextFormField).at(0), 'Walk regularly');
    await t.enterText(find.byType(TextFormField).at(1), 'My daily routine');
    await t.ensureVisible(find.text('Save'));
    await t.tap(find.text('Save'));
    await t.pumpAndSettle();
    expect(repo.saves, 1);
  });
  testWidgets('optional check-in saves without sensitive fields', (t) async {
    final repo = FakeAssistantRepository();
    await mount(
      t,
      const WellnessRecordEditor(kind: WellnessRecordKind.checkIns),
      repo,
    );
    await t.ensureVisible(find.text('Save'));
    await t.tap(find.text('Save'));
    await t.pumpAndSettle();
    expect(repo.saves, 1);
  });
  testWidgets('privacy opt-in persists and WhatsApp is honestly unavailable', (
    t,
  ) async {
    final repo = FakeAssistantRepository();
    await mount(t, const AssistantSettingsScreen(), repo);
    await t.ensureVisible(find.text('Allow chat processing'));
    await t.tap(find.text('Allow chat processing'));
    await t.pumpAndSettle();
    expect(repo.prefs['providerConsent'], isTrue);
    await mount(t, const WhatsAppLinkScreen(), repo);
    expect(find.text('Not connected'), findsOneWidget);
    expect(find.textContaining('delivery is not operational'), findsOneWidget);
  });
}
