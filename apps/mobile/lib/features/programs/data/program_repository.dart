import '../../../core/networking/api_client.dart';
import '../domain/program_models.dart';

class ProgramRepository {
  ProgramRepository(this.client);
  final ApiClient client;
  Future<ProgramPage> discover(Map<String, String> query) async =>
      ProgramPage.fromJson(
        await client.request(
          'GET',
          '/programs',
          query: query,
          authenticated: true,
        ),
      );
  Future<List<ProgramCategory>> categories() async => models(
    (await client.request(
      'GET',
      '/programs/categories',
      authenticated: true,
    ))['categories'],
    ProgramCategory.fromJson,
  );
  Future<Program> detail(String id) async => Program.fromJson(
    (await client.request(
          'GET',
          '/programs/$id',
          authenticated: true,
        ))['program']
        as Json,
  );
  Future<List<ProgramOverview>> mine() async => models(
    (await client.request(
      'GET',
      '/me/programs',
      authenticated: true,
    ))['programs'],
    ProgramOverview.fromJson,
  );
  Future<ProgramOverview> overview(String id) async => ProgramOverview.fromJson(
    await client.request('GET', '/me/programs/$id', authenticated: true),
  );
  Future<void> enroll(String id) async {
    await client.request(
      'POST',
      '/programs/$id/enroll',
      body: {},
      authenticated: true,
    );
  }

  Future<ProgramPayment> payment(String id) async => ProgramPayment.fromJson(
    (await client.request(
          'POST',
          '/programs/$id/payment',
          body: {},
          authenticated: true,
        ))['payment']
        as Json,
  );
  Future<bool> settle(String id, bool capture) async =>
      (await client.request(
        'POST',
        '/program-payments/$id/development-settle',
        body: {'outcome': capture ? 'capture' : 'fail'},
        authenticated: true,
      ))['verified'] ==
      true;
  Future<ProgramLesson> lesson(String id, String lessonId) async =>
      ProgramLesson.fromJson(
        (await client.request(
              'GET',
              '/me/programs/$id/lessons/$lessonId',
              authenticated: true,
            ))['lesson']
            as Json,
      );
  Future<ProgramOverview> progress(
    String id,
    String lessonId,
    int seconds,
    bool complete,
  ) async => ProgramOverview.fromJson(
    await client.request(
      'POST',
      '/me/programs/$id/lessons/$lessonId/progress',
      body: {'positionSeconds': seconds, 'completed': complete},
      authenticated: true,
    ),
  );
}
