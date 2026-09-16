import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:web_socket_channel/web_socket_channel.dart';

class DoctorAvailable {
  const DoctorAvailable(this.id);
  final String id;
  static DoctorAvailable? parse(Object? raw) {
    if (raw is! String || raw.length > 8192) return null;
    try {
      final data = jsonDecode(raw);
      if (data is! Map || data['type'] != 'DOCTOR_AVAILABLE') return null;
      final doctor = data['doctor'];
      if (doctor is! Map ||
          doctor['id'] is! String ||
          !RegExp(r'^[0-9a-fA-F-]{36}$').hasMatch(doctor['id'] as String) ||
          doctor['name'] is! String ||
          doctor['specialization'] is! String ||
          (doctor['profileImage'] != null &&
              doctor['profileImage'] is! String)) {
        return null;
      }
      // Only the ID is retained as a REST refresh hint, never as a Doctor record.
      return DoctorAvailable(doctor['id'] as String);
    } catch (_) {
      return null;
    }
  }
}

Uri patientRealtimeUri(Uri api) => api.replace(
  scheme: api.scheme == 'https' ? 'wss' : 'ws',
  path: '${api.path}/realtime/patient',
);

abstract interface class PatientSocket {
  Future<void> get ready;
  Stream<Object?> get messages;
  Future<void> close();
}

class ChannelPatientSocket implements PatientSocket {
  ChannelPatientSocket(Uri uri, String token)
    : _channel = WebSocketChannel.connect(
        uri,
        protocols: ['pocket-doctor.v1', 'session.$token'],
      );
  final WebSocketChannel _channel;
  @override
  Future<void> get ready => _channel.ready;
  @override
  Stream<Object?> get messages => _channel.stream;
  @override
  Future<void> close() async {
    await _channel.sink.close();
  }
}

typedef PatientSocketFactory = PatientSocket Function(Uri uri, String token);

class PatientRealtime {
  PatientRealtime({
    required this.api,
    required this.connect,
    required this.onConnected,
    required this.onDoctorAvailable,
    double Function()? jitter,
  }) : _jitter = jitter ?? Random().nextDouble;
  final Uri api;
  final PatientSocketFactory connect;
  final void Function() onConnected;
  final void Function(DoctorAvailable) onDoctorAvailable;
  final double Function() _jitter;
  PatientSocket? _socket;
  StreamSubscription<Object?>? _subscription;
  Timer? _retry, _stable, _deadline;
  String? _token;
  int _generation = 0, _attempts = 0;
  bool _paused = false, _disposed = false;
  final Set<String> _seen = {};

  void start(String token) {
    if (_disposed || (_token == token && !_paused)) return;
    stop();
    _token = token;
    _paused = false;
    _attempts = 0;
    _seen.clear();
    _open();
  }

  void pause() {
    _paused = true;
    _disconnect();
  }

  void resume() {
    if (!_paused || _disposed) return;
    _paused = false;
    if (_token != null) _open();
  }

  void stop() {
    _token = null;
    _disconnect();
    _seen.clear();
  }

  void dispose() {
    _disposed = true;
    stop();
  }

  void _disconnect() {
    _generation++;
    _retry?.cancel();
    _stable?.cancel();
    _deadline?.cancel();
    final subscription = _subscription;
    _subscription = null;
    if (subscription != null) unawaited(subscription.cancel());
    final socket = _socket;
    _socket = null;
    if (socket != null) unawaited(socket.close().catchError((Object _) {}));
  }

  void _failed(int generation) {
    if (generation != _generation || _disposed || _paused || _token == null) {
      return;
    }
    _disconnect();
    final seconds = min(60, 2 * pow(2, min(_attempts++, 5)).toInt());
    _retry = Timer(
      Duration(milliseconds: seconds * 1000 + (_jitter() * 1000).toInt()),
      _open,
    );
  }

  void _open() {
    if (_disposed || _paused || _token == null) return;
    final generation = ++_generation;
    bool welcomed = false;
    try {
      final socket = _socket = connect(patientRealtimeUri(api), _token!);
      _deadline = Timer(const Duration(seconds: 12), () => _failed(generation));
      _subscription = socket.messages.listen(
        (raw) {
          if (generation != _generation) return;
          if (!welcomed) {
            try {
              if (raw is! String ||
                  raw.length > 8192 ||
                  (jsonDecode(raw) as Map)['type'] != 'READY') {
                return;
              }
            } catch (_) {
              return;
            }
            welcomed = true;
            _deadline?.cancel();
            _stable = Timer(const Duration(seconds: 30), () => _attempts = 0);
            onConnected();
            return;
          }
          final event = DoctorAvailable.parse(raw);
          if (event != null && _seen.add(event.id)) {
            if (_seen.length > 128) _seen.remove(_seen.first);
            onDoctorAvailable(event);
          }
        },
        onError: (Object _) => _failed(generation),
        onDone: () => _failed(generation),
      );
      unawaited(socket.ready.catchError((Object _) => _failed(generation)));
    } catch (_) {
      _failed(generation);
    }
  }
}
