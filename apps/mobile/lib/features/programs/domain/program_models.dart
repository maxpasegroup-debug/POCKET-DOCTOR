typedef Json = Map<String, dynamic>;
List<String> strings(dynamic value) => (value as List? ?? []).cast<String>();
List<T> models<T>(dynamic value, T Function(Json) parse) =>
    (value as List? ?? []).map((item) => parse(item as Json)).toList();

class ProgramCategory {
  ProgramCategory.fromJson(Json json)
    : id = json['id'] as String,
      name = json['name'] as String;
  final String id, name;
}

class Program {
  Program.fromJson(Json j)
    : id = j['id'] as String,
      title = j['title'] as String,
      description = j['description'] as String,
      audience = j['audience'] as String? ?? '',
      outcomes = strings(j['outcomes']),
      coverUrl = j['coverUrl'] as String?,
      type = j['type'] as String,
      level = j['level'] as String? ?? 'Beginner',
      durationMinutes = j['durationMinutes'] as int,
      pricePaise = j['pricePaise'] as int,
      lessonCount = j['lessonCount'] as int,
      sessionCount = j['sessionCount'] as int? ?? 0,
      isDemo = j['isDemo'] == true,
      featured = j['featured'] == true,
      enrolled = j['enrolled'] == true,
      memberAccess = j['memberAccess'] == true,
      membershipRequired = j['membershipRequired'] == true,
      category = ProgramCategory.fromJson(j['category'] as Json),
      doctor = ProgramDoctor.fromJson(j['doctor'] as Json),
      modules = models(j['modules'], ProgramModule.fromJson),
      liveSessions = models(j['liveSessions'], ProgramLiveSession.fromJson),
      paymentMode = j['paymentMode'] as String? ?? 'disabled';
  final String id, title, description, audience, type, level, paymentMode;
  final String? coverUrl;
  final List<String> outcomes;
  final int durationMinutes, pricePaise, lessonCount, sessionCount;
  final bool isDemo, featured, enrolled;
  final bool memberAccess, membershipRequired;
  final ProgramCategory category;
  final ProgramDoctor doctor;
  final List<ProgramModule> modules;
  final List<ProgramLiveSession> liveSessions;
  bool get isLive => type == 'LIVE';
  String get price => pricePaise == 0
      ? 'Free'
      : '₹${(pricePaise / 100).toStringAsFixed(pricePaise % 100 == 0 ? 0 : 2)}';
}

class ProgramDoctor {
  ProgramDoctor.fromJson(Json j)
    : name = j['name'] as String,
      qualification = j['qualification'] as String,
      specialty = j['specialty'] as String,
      biography = j['biography'] as String,
      experienceYears = j['experienceYears'] as int?,
      verified = j['verified'] == true,
      isDemo = j['isDemo'] == true;
  final String name, qualification, specialty, biography;
  final int? experienceYears;
  final bool verified, isDemo;
}

class ProgramModule {
  ProgramModule.fromJson(Json j)
    : title = j['title'] as String,
      lessons = models(j['lessons'], LessonSummary.fromJson);
  final String title;
  final List<LessonSummary> lessons;
}

class LessonSummary {
  LessonSummary.fromJson(Json j)
    : id = j['id'] as String,
      title = j['title'] as String,
      durationSeconds = j['durationSeconds'] as int;
  final String id, title;
  final int durationSeconds;
}

class ProgramLiveSession {
  ProgramLiveSession.fromJson(Json j)
    : title = j['title'] as String,
      startsAt = DateTime.parse(j['startsAt'] as String),
      durationMinutes = j['durationMinutes'] as int,
      status = j['status'] as String,
      information = j['information'] as String?;
  final String title, status;
  final DateTime startsAt;
  final int durationMinutes;
  final String? information;
}

class ProgramOverview {
  ProgramOverview.fromJson(Json j)
    : program = Program.fromJson(j['program'] as Json),
      status = j['enrollment']['status'] as String,
      completedLessons = j['enrollment']['completedLessons'] as int,
      totalLessons = j['enrollment']['totalLessons'] as int,
      percentage = j['enrollment']['percentage'] as int,
      currentLessonId = j['enrollment']['currentLessonId'] as String?,
      completedAt = DateTime.tryParse(
        j['enrollment']['completedAt'] as String? ?? '',
      ),
      completedIds = (j['progress'] as List)
          .where((p) => p['completedAt'] != null)
          .map((p) => p['lessonId'] as String)
          .toSet();
  final Program program;
  final String status;
  final int completedLessons, totalLessons, percentage;
  final String? currentLessonId;
  final DateTime? completedAt;
  final Set<String> completedIds;
  bool get completed => status == 'COMPLETED';
}

class ProgramLesson {
  ProgramLesson.fromJson(Json j)
    : id = j['id'] as String,
      title = j['title'] as String,
      description = j['description'] as String,
      supportingMaterial = j['supportingMaterial'] as String,
      keyPoints = strings(j['keyPoints']),
      mediaUrl = j['mediaUrl'] as String?,
      nextLessonId = j['nextLessonId'] as String?,
      durationSeconds = j['durationSeconds'] as int,
      positionSeconds = j['positionSeconds'] as int,
      completed = j['completed'] == true,
      isDemo = j['isDemo'] == true;
  final String id, title, description, supportingMaterial;
  final List<String> keyPoints;
  final String? mediaUrl, nextLessonId;
  final int durationSeconds, positionSeconds;
  final bool completed, isDemo;
}

class ProgramPage {
  ProgramPage.fromJson(Json j)
    : programs = models(j['programs'], Program.fromJson),
      total = j['total'] as int,
      page = j['page'] as int;
  final List<Program> programs;
  final int total, page;
  bool get hasNext => page * 20 < total;
}

class ProgramPayment {
  ProgramPayment.fromJson(Json j)
    : id = j['id'] as String,
      amountPaise = j['amountPaise'] as int,
      mode = j['mode'] as String;
  final String id, mode;
  final int amountPaise;
}
