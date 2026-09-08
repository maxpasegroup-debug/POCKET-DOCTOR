import 'package:http/http.dart' as http;
import 'package:pocket_doctor/core/networking/api_client.dart';
import 'package:pocket_doctor/features/consultation/data/consultation_repository.dart';
import 'package:pocket_doctor/features/consultation/domain/consultation_models.dart';

const demoDoctor = PartnerDoctor(
  id: '30000000-0000-4000-8000-000000000001',
  name: 'DEMO partner',
  specialty: 'Sample general medicine',
  qualification: 'No real qualification',
  biography: 'Demonstration profile only.',
  languages: ['english'],
  feePaise: 10000,
  minutes: 30,
  timezone: 'Asia/Kolkata',
  isDemo: true,
);

class FakeConsultationRepository extends ConsultationRepository {
  FakeConsultationRepository({this.empty = false})
    : super(ApiClient(http.Client(), Uri.parse('http://localhost/api/v1')));
  final bool empty;
  bool fail = false;
  Duration detailDelay = Duration.zero;
  String? status;
  String paymentStatus = 'PENDING';
  Map<String, String> lastQuery = {};
  final slot = AppointmentSlot(
    DateTime.now().toUtc().add(const Duration(days: 1)),
    DateTime.now().toUtc().add(const Duration(days: 1, minutes: 30)),
  );
  void check() {
    if (fail) {
      throw const ApiFailure('Connection interrupted. Please try again.');
    }
  }

  Appointment appointment() => Appointment(
    id: 'booking',
    doctor: demoDoctor,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    status: status ?? 'PENDING_PAYMENT',
    paymentStatus: paymentStatus,
    holdExpiresAt: DateTime.now().add(const Duration(minutes: 10)),
    refundStatus: status == 'CANCELLED' ? 'REVIEW_REQUIRED' : 'NOT_REQUIRED',
    cancellationWindowMinutes: 120,
    feePaise: 10000,
    currency: 'INR',
  );
  @override
  Future<DoctorPage> discover(Map<String, String> query) async {
    check();
    lastQuery = query;
    return DoctorPage(
      empty || query['q'] == 'unknown' ? [] : [demoDoctor],
      empty ? 0 : 1,
      1,
    );
  }

  @override
  Future<List<String>> specialties() async {
    check();
    return empty ? [] : [demoDoctor.specialty];
  }

  @override
  Future<PartnerDoctor> doctor(String id) async {
    check();
    return demoDoctor;
  }

  @override
  Future<List<AppointmentSlot>> slots(String id, String date) async {
    check();
    return empty ? [] : [slot];
  }

  @override
  Future<List<Appointment>> mine() async {
    check();
    return status == null ? [] : [appointment()];
  }

  @override
  Future<Appointment> detail(String id) async {
    check();
    if (detailDelay > Duration.zero) await Future<void>.delayed(detailDelay);
    return appointment();
  }

  @override
  Future<Appointment> book(
    String doctorId,
    String date,
    AppointmentSlot slot,
  ) async {
    check();
    status = 'PENDING_PAYMENT';
    return appointment();
  }

  @override
  Future<ConsultationPayment> payment(String id) async {
    check();
    return const ConsultationPayment('payment', 10000, 'INR', 'development');
  }

  @override
  Future<Appointment> settle(String id, bool capture) async {
    check();
    paymentStatus = capture ? 'VERIFIED' : 'FAILED';
    status = capture ? 'CONFIRMED' : 'PENDING_PAYMENT';
    return appointment();
  }

  @override
  Future<Appointment> cancel(String id) async {
    check();
    status = 'CANCELLED';
    return appointment();
  }

  @override
  Future<Appointment> reschedule(
    String id,
    String date,
    AppointmentSlot slot,
  ) async {
    check();
    return appointment();
  }
}
