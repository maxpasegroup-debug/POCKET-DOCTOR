import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_doctor/features/programs/application/program_providers.dart';
import 'package:pocket_doctor/features/programs/domain/program_models.dart';
import 'package:pocket_doctor/features/programs/presentation/home_programs.dart';
import 'package:pocket_doctor/features/programs/presentation/program_widgets.dart';
import '../helpers/program_fakes.dart';

void main() {
  testWidgets(
    'Home shows a recorded program when none are featured, at narrow width',
    (t) async {
      t.view.physicalSize = const Size(320, 640);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      final program = Program.fromJson({...sampleProgram(), 'featured': false});
      await t.pumpWidget(
        ProviderScope(
          overrides: [
            homeProgramsProvider.overrideWith((ref) async => [program]),
            myProgramsProvider.overrideWith((ref) async => []),
            recommendedProgramsProvider.overrideWith((ref) async => []),
          ],
          child: MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(1.5)),
              child: child!,
            ),
            home: const Scaffold(
              body: SingleChildScrollView(
                padding: EdgeInsets.all(16),
                child: HomePrograms(),
              ),
            ),
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.byType(ProgramCard), findsOneWidget);
      expect(find.text(program.title), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );
}
