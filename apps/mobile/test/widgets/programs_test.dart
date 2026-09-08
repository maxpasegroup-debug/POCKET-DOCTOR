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
import 'package:pocket_doctor/features/programs/presentation/program_widgets.dart';
import '../helpers/auth_fakes.dart';
import '../helpers/program_fakes.dart';

void main() {
  Future<ProviderContainer> start(
    WidgetTester tester,
    FakeProgramRepository repository, {
    String path = '/programs',
    double scale = 1,
  }) async {
    tester.view.physicalSize = const Size(390, 844);
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
        programRepositoryProvider.overrideWithValue(repository),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(scale)),
          child: const PocketDoctorApp(),
        ),
      ),
    );
    container.read(appRouterProvider).go(path);
    await tester.pumpAndSettle();
    return container;
  }

  Future<void> tap(WidgetTester tester, String text) async {
    final finder = find.text(text).last;
    await tester.ensureVisible(finder);
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  testWidgets('discovery search, category filtering, clear and empty state', (
    tester,
  ) async {
    final repo = FakeProgramRepository();
    await start(tester, repo);
    expect(find.byType(ProgramCard), findsOneWidget);
    await tester.enterText(find.byKey(const Key('program-search')), 'unknown');
    await tap(tester, 'Search');
    expect(find.byType(ProgramCard), findsNothing);
    expect(repo.lastQuery['q'], 'unknown');
    await tap(tester, 'Clear filters');
    expect(find.byType(ProgramCard), findsOneWidget);
    await tap(tester, 'Nutrition');
    expect(repo.lastQuery['category'], 'nutrition');
    expect(find.byType(ProgramCard), findsNothing);
    await tap(tester, 'All topics');
    expect(find.byType(ProgramCard), findsOneWidget);
  });
  testWidgets(
    'details, enrollment, lesson navigation, completion and My Programs',
    (tester) async {
      final repo = FakeProgramRepository();
      final container = await start(
        tester,
        repo,
        path: '/programs/$testProgramId',
      );
      expect(find.text('DEMO Weight Management'), findsOneWidget);
      await tap(tester, 'Enroll Now');
      expect(repo.enrolled, true);
      await tap(tester, 'Resume learning');
      expect(find.text('First steps'), findsOneWidget);
      await tap(tester, 'Mark lesson complete');
      expect(find.text('Keep learning'), findsOneWidget);
      await tap(tester, 'Mark lesson complete');
      expect(find.text('A moment to recognise your effort.'), findsOneWidget);
      expect(repo.completed.length, 2);
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.text('Knowledge for a healthier life.'), findsOneWidget);
      container.read(appRouterProvider).go('/my-programs');
      await tester.pumpAndSettle();
      await tap(tester, 'Completed');
      expect(find.byType(ProgramCard), findsOneWidget);
    },
  );
  testWidgets('demo payment failure does not enroll; verified retry does', (
    tester,
  ) async {
    final repo = FakeProgramRepository(paid: true);
    await start(tester, repo, path: '/programs/$testProgramId');
    await tap(tester, 'Purchase · ₹499');
    expect(find.text('Development payment'), findsOneWidget);
    await tap(tester, 'Simulate failure');
    expect(repo.enrolled, false);
    expect(
      find.text('Payment could not be completed. Please try again.'),
      findsOneWidget,
    );
    await tap(tester, 'Purchase · ₹499');
    await tap(tester, 'Simulate payment');
    expect(repo.enrolled, true);
    expect(find.text('One step at a time.'), findsOneWidget);
  });
  testWidgets('lesson network interruption keeps progress retryable', (
    tester,
  ) async {
    final repo = FakeProgramRepository()..enrolled = true;
    await start(
      tester,
      repo,
      path: '/my-programs/$testProgramId/lessons/lesson-1',
    );
    repo.fail = true;
    await tap(tester, 'Mark lesson complete');
    expect(repo.completed, isEmpty);
    expect(
      find.text(
        'Your latest progress could not be saved. Please try again before leaving.',
      ),
      findsOneWidget,
    );
    repo.fail = false;
    await tap(tester, 'Mark lesson complete');
    expect(repo.completed, contains('lesson-1'));
    expect(find.text('Keep learning'), findsOneWidget);
  });

  testWidgets('network error retry and empty My Programs', (tester) async {
    final repo = FakeProgramRepository(fail: true);
    final container = await start(
      tester,
      repo,
      path: '/programs/$testProgramId',
    );
    expect(find.text('Could not connect. Please try again.'), findsOneWidget);
    repo.fail = false;
    await tap(tester, 'Try again');
    expect(find.text('DEMO Weight Management'), findsOneWidget);
    container.read(appRouterProvider).go('/my-programs');
    await tester.pumpAndSettle();
    expect(find.text("You haven't joined a program yet."), findsOneWidget);
  });
  testWidgets(
    'all program screens fit narrow layout with 2x text; live schedule',
    (tester) async {
      final repo = FakeProgramRepository(live: true)..enrolled = true;
      final container = await start(
        tester,
        repo,
        path: '/programs/$testProgramId',
        scale: 2,
      );
      tester.view.physicalSize = const Size(320, 568);
      for (final path in [
        '/programs',
        '/programs/$testProgramId',
        '/my-programs',
        '/my-programs/$testProgramId',
      ]) {
        container.read(appRouterProvider).go(path);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: path);
      }
      expect(find.text('DEMO live session'), findsOneWidget);
      repo.live = false;
      container
          .read(appRouterProvider)
          .go('/my-programs/$testProgramId/lessons/lesson-1');
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );
}
