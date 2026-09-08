import '../../../core/networking/api_client.dart';
import '../domain/consultation_models.dart';

class ConsultationRepository {
  ConsultationRepository(this.client);
  final ApiClient client;
  Future<DoctorPage> discover(Map<String, String> query) async =>
      DoctorPage.fromJson(
        await client.request(
          'GET',
          '/doctors',
          query: query,
          authenticated: true,
        ),
      );
  Future<List<String>> specialties() async =>
      ((await client.request(
                'GET',
                '/specialties',
                authenticated: true,
              ))['specialties']
              as List)
          .cast<String>();
  Future<PartnerDoctor> doctor(String id) async => PartnerDoctor.fromJson(
    (await client.request('GET', '/doctors/$id', authenticated: true))['doctor']
        as ConsultationJson,
  );
  Future<List<AppointmentSlot>> slots(String id, String date) async =>
      ((await client.request(
                'GET',
                '/doctors/$id/slots',
                query: {'date': date},
                authenticated: true,
              ))['slots']
              as List)
          .map((s) => AppointmentSlot.fromJson(s as ConsultationJson))
          .toList();
  Future<List<Appointment>> mine() async =>
      ((await client.request(
                'GET',
                '/me/consultations',
                authenticated: true,
              ))['consultations']
              as List)
          .map((a) => Appointment.fromJson(a as ConsultationJson))
          .toList();
  Future<Appointment> detail(String id) async => Appointment.fromJson(
    (await client.request(
          'GET',
          '/me/consultations/$id',
          authenticated: true,
        ))['consultation']
        as ConsultationJson,
  );
  Future<Appointment> _post(String path, ConsultationJson body) async =>
      Appointment.fromJson(
        (await client.request(
              'POST',
              path,
              body: body,
              authenticated: true,
            ))['consultation']
            as ConsultationJson,
      );
  Future<Appointment> book(
    String doctorId,
    String date,
    AppointmentSlot slot,
  ) => _post('/consultations/book', {
    'doctorId': doctorId,
    'date': date,
    'startsAt': slot.startsAt.toUtc().toIso8601String(),
  });
  Future<Appointment> cancel(String id) =>
      _post('/consultations/$id/cancel', {});
  Future<Appointment> reschedule(
    String id,
    String date,
    AppointmentSlot slot,
  ) => _post('/consultations/$id/reschedule', {
    'date': date,
    'startsAt': slot.startsAt.toUtc().toIso8601String(),
  });
  Future<ConsultationPayment> payment(String id) async =>
      ConsultationPayment.fromJson(
        (await client.request(
              'POST',
              '/consultations/$id/payment',
              body: {},
              authenticated: true,
            ))['payment']
            as ConsultationJson,
      );
  Future<Appointment> settle(String paymentId, bool capture) => _post(
    '/consultation-payments/$paymentId/development-settle',
    {'outcome': capture ? 'capture' : 'fail'},
  );
}
