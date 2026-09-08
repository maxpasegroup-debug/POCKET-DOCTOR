import 'package:http/http.dart' as http;
import 'package:pocket_doctor/core/networking/api_client.dart';
import 'package:pocket_doctor/features/programs/data/program_repository.dart';
import 'package:pocket_doctor/features/programs/domain/program_models.dart';

const testProgramId = '20000000-0000-4000-8000-000000000011';
Json sampleProgram({
  bool enrolled = false,
  bool paid = false,
  bool live = false,
}) => {
  'id': testProgramId,
  'title': 'DEMO Weight Management',
  'description': 'Demo learning journey',
  'audience': 'Demo audience',
  'outcomes': ['Explore learning'],
  'type': live ? 'LIVE' : 'RECORDED',
  'durationMinutes': 10,
  'pricePaise': paid ? 49900 : 0,
  'lessonCount': 2,
  'sessionCount': live ? 1 : 0,
  'isDemo': true,
  'featured': true,
  'enrolled': enrolled,
  'paymentMode': 'development',
  'category': {'id': 'weight-management', 'name': 'Weight Management'},
  'doctor': {
    'name': 'DEMO professional',
    'qualification': 'No real credential',
    'specialty': 'Sample',
    'biography': 'Demo only',
    'isDemo': true,
    'verified': false,
  },
  'modules': live
      ? []
      : [
          {
            'title': 'Getting started',
            'lessons': [
              {'id': 'lesson-1', 'title': 'First steps', 'durationSeconds': 30},
              {
                'id': 'lesson-2',
                'title': 'Keep learning',
                'durationSeconds': 30,
              },
            ],
          },
        ],
  'liveSessions': live
      ? [
          {
            'title': 'DEMO live session',
            'startsAt': '2027-01-01T10:00:00Z',
            'durationMinutes': 60,
            'status': 'UPCOMING',
            'information': enrolled ? 'Demo schedule only' : null,
          },
        ]
      : [],
};

class FakeProgramRepository extends ProgramRepository {
  FakeProgramRepository({
    this.empty = false,
    this.fail = false,
    this.paid = false,
    this.live = false,
  }) : super(ApiClient(http.Client(), Uri.parse('http://localhost/api/v1')));
  bool empty, fail, paid, live, enrolled = false;
  int position = 0;
  final completed = <String>{};
  Map<String, String> lastQuery = {};
  void check() {
    if (fail) throw const ApiFailure('Could not connect. Please try again.');
  }

  Json get json => sampleProgram(enrolled: enrolled, paid: paid, live: live);
  @override
  Future<ProgramPage> discover(Map<String, String> query) async {
    check();
    lastQuery = query;
    final matches =
        (query['q'] == null ||
            'demo weight management'.contains(query['q']!.toLowerCase())) &&
        (query['category'] == null || query['category'] == 'weight-management');
    return ProgramPage.fromJson({
      'programs': empty || !matches ? [] : [json],
      'total': empty || !matches ? 0 : 1,
      'page': 1,
    });
  }

  @override
  Future<List<ProgramCategory>> categories() async {
    check();
    return [
      ProgramCategory.fromJson({
        'id': 'weight-management',
        'name': 'Weight Management',
      }),
      ProgramCategory.fromJson({'id': 'nutrition', 'name': 'Nutrition'}),
    ];
  }

  @override
  Future<Program> detail(String id) async {
    check();
    return Program.fromJson(json);
  }

  @override
  Future<void> enroll(String id) async {
    check();
    enrolled = true;
  }

  @override
  Future<ProgramPayment> payment(String id) async {
    check();
    return ProgramPayment.fromJson({
      'id': 'payment-1',
      'amountPaise': 49900,
      'mode': 'development',
    });
  }

  @override
  Future<bool> settle(String id, bool capture) async {
    check();
    enrolled = capture;
    return capture;
  }

  @override
  Future<List<ProgramOverview>> mine() async {
    check();
    return enrolled ? [await overview(testProgramId)] : [];
  }

  @override
  Future<ProgramOverview> overview(String id) async {
    check();
    return ProgramOverview.fromJson({
      'program': json,
      'enrollment': {
        'status': completed.length == 2 ? 'COMPLETED' : 'IN_PROGRESS',
        'completedLessons': completed.length,
        'totalLessons': 2,
        'percentage': completed.length * 50,
        'currentLessonId': completed.contains('lesson-1')
            ? 'lesson-2'
            : 'lesson-1',
        'completedAt': completed.length == 2 ? '2026-09-07T00:00:00Z' : null,
      },
      'progress': [
        for (final id in completed)
          {'lessonId': id, 'completedAt': '2026-09-07T00:00:00Z'},
      ],
    });
  }

  @override
  Future<ProgramLesson> lesson(String id, String lessonId) async {
    check();
    return ProgramLesson.fromJson({
      'id': lessonId,
      'title': lessonId == 'lesson-1' ? 'First steps' : 'Keep learning',
      'description': 'Demo reading lesson',
      'supportingMaterial': 'Reflect privately.',
      'keyPoints': ['Demo only'],
      'durationSeconds': 30,
      'positionSeconds': position,
      'completed': completed.contains(lessonId),
      'isDemo': true,
      'nextLessonId': lessonId == 'lesson-1' ? 'lesson-2' : null,
    });
  }

  @override
  Future<ProgramOverview> progress(
    String id,
    String lessonId,
    int seconds,
    bool complete,
  ) async {
    check();
    position = seconds;
    if (complete) completed.add(lessonId);
    return overview(id);
  }
}
