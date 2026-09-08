typedef ConsultationJson = Map<String, dynamic>;

class PartnerDoctor {
  const PartnerDoctor({
    required this.id,
    required this.name,
    required this.specialty,
    required this.qualification,
    required this.biography,
    required this.languages,
    required this.feePaise,
    required this.minutes,
    required this.timezone,
    this.isDemo = false,
    this.verified = false,
    this.featured = false,
    this.photoUrl,
    this.experienceYears,
  });
  final String id, name, specialty, qualification, biography, timezone;
  final List<String> languages;
  final int feePaise, minutes;
  final bool isDemo, verified, featured;
  final String? photoUrl;
  final int? experienceYears;
  String get price =>
      feePaise == 0 ? 'Free' : '₹${(feePaise / 100).toStringAsFixed(2)}';
  factory PartnerDoctor.fromJson(ConsultationJson j) => PartnerDoctor(
    id: j['id'] as String,
    name: j['name'] as String,
    specialty: j['specialty'] as String,
    qualification: j['qualification'] as String,
    biography: j['biography'] as String,
    languages: (j['languages'] as List).cast<String>(),
    feePaise: j['feePaise'] as int,
    minutes: j['consultationMinutes'] as int,
    timezone: j['timezone'] as String,
    isDemo: j['isDemo'] == true,
    verified: j['verified'] == true,
    featured: j['featured'] == true,
    photoUrl: j['photoUrl'] as String?,
    experienceYears: j['experienceYears'] as int?,
  );
}

class DoctorPage {
  const DoctorPage(this.doctors, this.total, this.page);
  final List<PartnerDoctor> doctors;
  final int total, page;
  factory DoctorPage.fromJson(ConsultationJson j) => DoctorPage(
    (j['doctors'] as List)
        .map((d) => PartnerDoctor.fromJson(d as ConsultationJson))
        .toList(),
    j['total'] as int,
    j['page'] as int,
  );
}

class AppointmentSlot {
  const AppointmentSlot(this.startsAt, this.endsAt);
  final DateTime startsAt, endsAt;
  factory AppointmentSlot.fromJson(ConsultationJson j) => AppointmentSlot(
    DateTime.parse(j['startsAt'] as String),
    DateTime.parse(j['endsAt'] as String),
  );
}

class ConsultationNote {
  const ConsultationNote(
    this.summary,
    this.followUpRequired,
    this.followUpDate,
    this.followUpNote,
  );
  final String summary, followUpNote;
  final bool followUpRequired;
  final String? followUpDate;
  factory ConsultationNote.fromJson(ConsultationJson j) => ConsultationNote(
    j['summary'] as String,
    j['followUpRequired'] == true,
    j['followUpDate'] as String?,
    j['followUpNote'] as String,
  );
}

class Appointment {
  const Appointment({
    required this.id,
    required this.doctor,
    required this.startsAt,
    required this.endsAt,
    required this.status,
    required this.paymentStatus,
    required this.holdExpiresAt,
    required this.refundStatus,
    required this.cancellationWindowMinutes,
    required this.feePaise,
    required this.currency,
    this.note,
  });
  final String id, status, paymentStatus, refundStatus, currency;
  final PartnerDoctor doctor;
  final DateTime startsAt, endsAt, holdExpiresAt;
  final int cancellationWindowMinutes, feePaise;
  String get price => feePaise == 0
      ? 'Free'
      : '$currency ${(feePaise / 100).toStringAsFixed(2)}';
  final ConsultationNote? note;
  bool get upcoming =>
      ['PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'].contains(status);
  String get statusLabel => status.toLowerCase().replaceAll('_', ' ');
  factory Appointment.fromJson(ConsultationJson j) => Appointment(
    id: j['id'] as String,
    doctor: PartnerDoctor.fromJson(j['doctor'] as ConsultationJson),
    startsAt: DateTime.parse(j['startsAt'] as String),
    endsAt: DateTime.parse(j['endsAt'] as String),
    status: j['status'] as String,
    paymentStatus: j['paymentStatus'] as String,
    holdExpiresAt: DateTime.parse(j['holdExpiresAt'] as String),
    refundStatus: j['refundStatus'] as String,
    cancellationWindowMinutes: j['cancellationWindowMinutes'] as int,
    feePaise: j['feePaise'] as int,
    currency: j['currency'] as String,
    note: j['note'] == null
        ? null
        : ConsultationNote.fromJson(j['note'] as ConsultationJson),
  );
}

class ConsultationPayment {
  const ConsultationPayment(
    this.id,
    this.amountPaise,
    this.currency,
    this.mode,
  );
  final String id, currency, mode;
  final int amountPaise;
  factory ConsultationPayment.fromJson(ConsultationJson j) =>
      ConsultationPayment(
        j['id'] as String,
        j['amountPaise'] as int,
        j['currency'] as String,
        j['mode'] as String,
      );
}
