import '../helpers/membership_fakes.dart';
import 'package:pocket_doctor/features/membership/application/membership_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_doctor/app.dart';
import 'package:pocket_doctor/core/routing/app_router.dart';
import 'package:pocket_doctor/features/auth/application/auth_controller.dart';
import 'package:pocket_doctor/features/auth/domain/auth_models.dart';
import 'package:pocket_doctor/features/consultation/application/consultation_providers.dart';
import 'package:pocket_doctor/features/consultation/presentation/consultation_widgets.dart';
import 'package:pocket_doctor/features/programs/application/program_providers.dart';
import '../helpers/auth_fakes.dart';
import '../helpers/program_fakes.dart';
import '../helpers/consultation_fakes.dart';

void main() {
  Future<ProviderContainer> start(
    WidgetTester tester,
    FakeConsultationRepository repository, {
    String path = '/consult',
    double width = 390,
    double scale = 1,
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
        consultationRepositoryProvider.overrideWithValue(repository),
        programRepositoryProvider.overrideWithValue(
          FakeProgramRepository(empty: true),
        ),
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
    await tester.pump(const Duration(seconds: 2));
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

  testWidgets(
    'payment dialog survives delayed appointment refresh and polling',
    (tester) async {
      final repo = FakeConsultationRepository()
        ..status = 'PENDING_PAYMENT'
        ..detailDelay = const Duration(milliseconds: 200);
      await start(tester, repo, path: '/consultation/booking');
      await tap(tester, 'Continue to payment');
      await tester.pump(const Duration(seconds: 31));
      await tester.pumpAndSettle();
      await tap(tester, 'Simulate payment');
      expect(repo.status, 'CONFIRMED');
      expect(find.text('Demo reservation booked'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('doctor discovery, search, specialty filter and clear', (
    tester,
  ) async {
    final repo = FakeConsultationRepository();
    await start(tester, repo);
    expect(find.byType(DoctorCard), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'unknown');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(find.byType(DoctorCard), findsNothing);
    expect(repo.lastQuery['q'], 'unknown');
    await tester.tap(find.byTooltip('Clear search'));
    await tester.pumpAndSettle();
    final specialtyChip = find.widgetWithText(ChoiceChip, demoDoctor.specialty);
    await tester.ensureVisible(specialtyChip);
    await tester.tap(specialtyChip);
    await tester.pumpAndSettle();
    expect(repo.lastQuery['specialty'], demoDoctor.specialty);
  });
  testWidgets(
    'profile, slot, review, failed payment, retry and verified confirmation',
    (tester) async {
      final repo = FakeConsultationRepository();
      await start(tester, repo, path: '/doctors/${demoDoctor.id}');
      expect(find.text(demoDoctor.biography), findsOneWidget);
      await tap(tester, 'Choose date & time');
      final slot = find.byType(ChoiceChip).first;
      await tester.ensureVisible(slot);
      await tester.tap(slot);
      await tester.pumpAndSettle();
      await tap(tester, 'Review reservation');
      expect(find.text(providerNotice), findsOneWidget);
      await tap(tester, 'Reserve this time');
      expect(repo.status, 'PENDING_PAYMENT');
      await tap(tester, 'Continue to payment');
      await tap(tester, 'Simulate failure');
      expect(repo.paymentStatus, 'FAILED');
      expect(find.text('Demo reservation booked'), findsNothing);
      await tap(tester, 'Continue to payment');
      await tap(tester, 'Simulate payment');
      expect(find.text('Demo reservation booked'), findsOneWidget);
      expect(repo.status, 'CONFIRMED');
      await tap(tester, 'View appointment');
      expect(find.text('Demo reservation booked'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('upcoming history and cancellation preserve truthful state', (
    tester,
  ) async {
    final repo = FakeConsultationRepository()..status = 'CONFIRMED';
    await start(tester, repo);
    await tap(tester, 'Upcoming');
    expect(find.byType(AppointmentCard), findsOneWidget);
    await tap(tester, 'View appointment');
    await tap(tester, 'Cancel reservation');
    await tap(tester, 'Confirm cancellation');
    expect(repo.status, 'CANCELLED');
    expect(find.textContaining('Refund review required'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tap(tester, 'History');
    expect(find.text('cancelled'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('discovery errors can retry and empty history is explicit', (
    tester,
  ) async {
    final repo = FakeConsultationRepository(empty: true)..fail = true;
    await start(tester, repo);
    expect(find.textContaining('Connection interrupted'), findsWidgets);
    repo.fail = false;
    await tap(tester, 'Try again');
    expect(find.textContaining('No matching doctors'), findsOneWidget);
    await tap(tester, 'History');
    expect(find.textContaining('completed and cancelled'), findsOneWidget);
  });
  testWidgets('empty slots have no enabled review action', (tester) async {
    await start(
      tester,
      FakeConsultationRepository(empty: true),
      path: '/doctors/${demoDoctor.id}/book',
    );
    expect(find.textContaining('No available times'), findsOneWidget);
    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Review reservation'),
    );
    expect(button.onPressed, isNull);
  });
  testWidgets(
    'narrow screen and large text do not overflow doctor or booking UI',
    (tester) async {
      final container = await start(
        tester,
        FakeConsultationRepository(),
        path: '/doctors/${demoDoctor.id}',
        width: 320,
        scale: 2,
      );
      expect(tester.takeException(), isNull);
      container.read(appRouterProvider).go('/doctors/${demoDoctor.id}/book');
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'confirmation route does not claim unverified or expired booking',
    (tester) async {
      await start(
        tester,
        FakeConsultationRepository()..status = 'EXPIRED',
        path: '/consultation/booking/confirmation',
      );
      expect(find.text('Demo reservation booked'), findsNothing);
      expect(find.text('This reservation expired'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
