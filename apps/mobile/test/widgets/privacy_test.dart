import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:pocket_doctor/core/networking/api_client.dart';
import 'package:pocket_doctor/features/privacy/data/privacy_repository.dart';
import 'package:pocket_doctor/features/privacy/application/privacy_providers.dart';
import 'package:pocket_doctor/features/privacy/presentation/privacy_screen.dart';
import 'package:pocket_doctor/features/notifications/presentation/notifications_screen.dart';

class FakePrivacy extends PrivacyRepository {
  FakePrivacy()
    : super(ApiClient(http.Client(), Uri.parse('http://localhost/api/v1')));
  bool fail = false;
  bool granted = false;
  int deletions = 0;
  @override
  Future<Map<String, dynamic>> privacy() async {
    if (fail) throw const ApiFailure('Unavailable');
    return {
      'consents': [
        {'type': 'MARKETING', 'granted': granted},
      ],
      'requests': [],
      'policies': [],
    };
  }

  @override
  Future<void> consent(String type, bool value, {String version = '1'}) async {
    if (type == 'MARKETING') granted = value;
  }

  @override
  Future<void> deleteAccess() async {
    deletions++;
  }

  @override
  Future<Map<String, dynamic>> export(String category, int page) async => {
    'items': [],
    'hasMore': false,
  };
  @override
  Future<Map<String, dynamic>> notifications(int page) async {
    if (fail) throw const ApiFailure('Unavailable');
    return {'items': [], 'hasMore': false};
  }
}

Future<void> mount(WidgetTester t, Widget screen, FakePrivacy repo) async {
  await t.pumpWidget(
    ProviderScope(
      retry: (_, _) => null,
      overrides: [privacyRepositoryProvider.overrideWithValue(repo)],
      child: MaterialApp(home: screen),
    ),
  );
  await t.pumpAndSettle();
}

void main() {
  testWidgets(
    'privacy separates marketing permission and communicates pending legal documents',
    (t) async {
      final repo = FakePrivacy();
      await mount(t, const PrivacyScreen(), repo);
      expect(find.text('Your information. Your choices.'), findsOneWidget);
      expect(find.textContaining('Legal review is required'), findsOneWidget);
      await t.tap(find.text('Offers & marketing'));
      await t.pumpAndSettle();
      expect(repo.granted, true);
    },
  );
  testWidgets('privacy failure has a functioning retry', (t) async {
    final repo = FakePrivacy()..fail = true;
    await mount(t, const PrivacyScreen(), repo);
    expect(find.text('We could not load your preferences.'), findsOneWidget);
    repo.fail = false;
    await t.tap(find.text('Retry'));
    await t.pumpAndSettle();
    expect(find.text('Offers & marketing'), findsOneWidget);
  });
  testWidgets(
    'account deletion requires confirmation and cancellation preserves access',
    (t) async {
      final repo = FakePrivacy();
      await mount(t, const PrivacyScreen(), repo);
      await t.ensureVisible(find.text('Request account deletion'));
      await t.tap(find.text('Request account deletion'));
      await t.pumpAndSettle();
      expect(find.text('Request account deletion?'), findsOneWidget);
      await t.tap(find.text('Keep my account'));
      await t.pumpAndSettle();
      expect(repo.deletions, 0);
    },
  );
  testWidgets('export empty state and pagination are understandable', (
    t,
  ) async {
    await mount(t, const PrivacyExportScreen(), FakePrivacy());
    expect(find.text('There are no records in this section.'), findsOneWidget);
    expect(find.text('Page 1'), findsOneWidget);
  });
  testWidgets('notification inbox has an honest empty state', (t) async {
    await mount(t, const NotificationsScreen(), FakePrivacy());
    expect(find.textContaining('You are all caught up'), findsOneWidget);
  });
  testWidgets('notification failure supports retry on a narrow screen', (
    t,
  ) async {
    t.view.physicalSize = const Size(320, 640);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    final repo = FakePrivacy()..fail = true;
    await mount(t, const NotificationsScreen(), repo);
    expect(find.text('We could not load your updates.'), findsOneWidget);
    repo.fail = false;
    await t.tap(find.text('Retry'));
    await t.pumpAndSettle();
    expect(t.takeException(), isNull);
  });
}
