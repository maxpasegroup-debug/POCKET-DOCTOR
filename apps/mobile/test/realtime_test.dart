import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:pocket_doctor/core/config/app_config.dart';
import 'package:pocket_doctor/core/networking/api_client.dart';
import 'package:pocket_doctor/core/routing/app_router.dart';
import 'package:pocket_doctor/features/auth/application/auth_controller.dart';
import 'package:pocket_doctor/features/auth/domain/auth_models.dart';
import 'package:pocket_doctor/features/consultation/application/consultation_providers.dart';
import 'package:pocket_doctor/features/consultation/domain/consultation_models.dart';
import 'package:pocket_doctor/features/realtime/patient_realtime.dart';
import 'package:pocket_doctor/features/realtime/realtime_providers.dart';
import 'package:pocket_doctor/features/realtime/realtime_notice.dart';
import 'helpers/auth_fakes.dart';
import 'helpers/consultation_fakes.dart';

class FakeSocket implements PatientSocket {
  final controller = StreamController<Object?>();
  bool closed = false;
  @override
  Future<void> get ready async {}
  @override
  Stream<Object?> get messages => controller.stream;
  @override
  Future<void> close() async {
    closed = true;
    unawaited(controller.close());
  }
}

String available([String id = '30000000-0000-4000-8000-000000000001']) =>
    jsonEncode({
      'type': 'DOCTOR_AVAILABLE',
      'doctor': {
        'id': id,
        'name': 'Public doctor',
        'specialization': 'Specialty',
        'profileImage': null,
      },
    });

class CountingDoctors extends FakeConsultationRepository {
  int discoveries = 0, details = 0;
  bool hidden = false;
  @override
  Future<DoctorPage> discover(Map<String, String> query) {
    discoveries++;
    return super.discover(query);
  }

  @override
  Future<PartnerDoctor> doctor(String id) async {
    details++;
    if (hidden) throw const ApiFailure('Not available', status: 404);
    return super.doctor(id);
  }
}

void main() {
  test(
    'event parser rejects malformed input and only retains the REST refresh ID',
    () {
      expect(DoctorAvailable.parse(available())?.id, demoDoctor.id);
      for (final input in [
        null,
        42,
        'bad json',
        '[]',
        '{}',
        '{"type":"ADMIN_EVENT"}',
        '{"type":"DOCTOR_AVAILABLE","doctor":{"id":"invalid"}}',
        'x' * 8193,
      ]) {
        expect(DoctorAvailable.parse(input), isNull);
      }
      expect(
        patientRealtimeUri(Uri.parse('https://host.example/api/v1')).toString(),
        'wss://host.example/api/v1/realtime/patient',
      );
      expect(
        patientRealtimeUri(Uri.parse('http://localhost:3018/api/v1')).scheme,
        'ws',
      );
    },
  );

  testWidgets(
    'connect, authenticate transport, reconnect with backoff and disconnect on logout',
    (tester) async {
      final sockets = <FakeSocket>[];
      final connections = <(Uri, String)>[];
      int ready = 0, events = 0;
      final client = PatientRealtime(
        api: Uri.parse('https://host.example/api/v1'),
        jitter: () => 0,
        connect: (uri, token) {
          connections.add((uri, token));
          final socket = FakeSocket();
          sockets.add(socket);
          return socket;
        },
        onConnected: () => ready++,
        onDoctorAvailable: (_) => events++,
      );
      client.start('private-session');
      sockets.last.controller.add('{"type":"READY"}');
      await tester.pump();
      expect(ready, 1);
      sockets.last.controller.add(available());
      sockets.last.controller.add(available());
      sockets.last.controller.add('broken');
      await tester.pump();
      expect(events, 1);
      unawaited(sockets.last.controller.close());
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1999));
      expect(sockets.length, 1);
      await tester.pump(const Duration(milliseconds: 1));
      expect(sockets.length, 2);
      sockets.last.controller.add('{"type":"READY"}');
      await tester.pump();
      expect(ready, 2);
      unawaited(sockets.last.controller.close());
      await tester.pump();
      await tester.pump(const Duration(seconds: 3));
      expect(sockets.length, 2);
      await tester.pump(const Duration(seconds: 1));
      expect(sockets.length, 3);
      client.stop();
      expect(
        connections.every(
          (c) =>
              c.$1.scheme == 'wss' &&
              !c.$1.hasQuery &&
              c.$2 == 'private-session',
        ),
        isTrue,
      );
      expect(sockets.last.closed, true);
      await tester.pump(const Duration(minutes: 3));
      expect(sockets.length, 3);
      client.dispose();
    },
  );

  testWidgets(
    'handshake timeout, pause/resume, stale messages and disposal are safe',
    (tester) async {
      final sockets = <FakeSocket>[];
      int events = 0;
      final client = PatientRealtime(
        api: Uri.parse('https://host.example/api/v1'),
        jitter: () => 0,
        connect: (_, _) {
          final socket = FakeSocket();
          sockets.add(socket);
          return socket;
        },
        onConnected: () {},
        onDoctorAvailable: (_) => events++,
      );
      client.start('session');
      sockets.first.controller.add(available());
      await tester.pump();
      expect(events, 0);
      await tester.pump(const Duration(seconds: 12));
      expect(sockets.first.closed, true);
      client.pause();
      await tester.pump(const Duration(minutes: 1));
      expect(sockets.length, 1);
      client.resume();
      expect(sockets.length, 2);
      client.dispose();
      await tester.pump(const Duration(minutes: 1));
      expect(sockets.length, 2);
      expect(sockets.last.closed, true);
    },
  );

  testWidgets(
    'Patient provider refreshes REST on connection/event; notification opens existing discovery route and logout disconnects',
    (tester) async {
      final sockets = <FakeSocket>[];
      final repository = CountingDoctors();
      final client = ApiClient(
        http.Client(),
        Uri.parse('https://host.example/api/v1'),
      )..token = 'test-session';
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (_, _) => const Scaffold(body: Text('Home')),
          ),
          GoRoute(
            path: '/consult',
            builder: (_, _) =>
                const Scaffold(body: Text('Existing Doctor Discovery')),
          ),
        ],
      );
      final container = ProviderContainer(
        overrides: [
          authProvider.overrideWith(
            () => ReadyAuthController(
              const AuthState(phase: AuthPhase.signedIn, user: testUser),
            ),
          ),
          apiClientProvider.overrideWithValue(client),
          appConfigProvider.overrideWithValue(
            AppConfig(
              environment: AppEnvironment.staging,
              apiBaseUrl: 'https://host.example/api/v1',
            ),
          ),
          consultationRepositoryProvider.overrideWithValue(repository),
          appRouterProvider.overrideWithValue(router),
          patientSocketFactoryProvider.overrideWithValue((_, _) {
            final s = FakeSocket();
            sockets.add(s);
            return s;
          }),
        ],
      );
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(
            routerConfig: router,
            builder: (_, child) => PatientRealtimeNotice(child: child!),
          ),
        ),
      );
      await tester.pump();
      expect(sockets.length, 1);
      sockets.first.controller.add('{"type":"READY"}');
      await tester.pumpAndSettle();
      expect(repository.discoveries, 1);
      sockets.first.controller.add(available());
      await tester.pumpAndSettle();
      expect(repository.discoveries, 2);
      expect(repository.details, 1);
      expect(find.text('A new doctor is now available.'), findsOneWidget);
      await tester.tap(find.text('View doctors'));
      await tester.pumpAndSettle();
      expect(find.text('Existing Doctor Discovery'), findsOneWidget);
      repository.hidden = true;
      sockets.first.controller.add(
        available('30000000-0000-4000-8000-000000000002'),
      );
      await tester.pumpAndSettle();
      expect(find.text('A new doctor is now available.'), findsNothing);
      (container.read(authProvider.notifier) as ReadyAuthController).seed(
        const AuthState(phase: AuthPhase.signedOut),
      );
      await tester.pumpAndSettle();
      expect(sockets.first.closed, true);
      await tester.pumpWidget(const SizedBox());
      container.dispose();
      router.dispose();
      await tester.pump();
      expect(tester.takeException(), isNull);
    },
  );
}
