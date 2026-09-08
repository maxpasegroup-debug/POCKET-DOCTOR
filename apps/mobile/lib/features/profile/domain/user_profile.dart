const wellnessInterests = [
  'Weight Management',
  'Diabetes & Lifestyle Health',
  'Mental Wellness',
  'Nutrition',
  'Fitness',
  'Sleep',
  "Women's Health",
  "Men's Health",
  'Preventive Wellness',
  'Other',
];
const supportedLanguages = <String, String>{
  'en': 'English',
  'hi': 'Hindi',
  'ml': 'Malayalam',
  'ta': 'Tamil',
  'te': 'Telugu',
  'kn': 'Kannada',
  'mr': 'Marathi',
  'bn': 'Bengali',
};

class UserProfile {
  const UserProfile({
    required this.id,
    required this.phone,
    this.fullName,
    this.language = 'en',
    this.interests = const [],
    this.profileComplete = false,
    this.notifications = false,
  });
  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
    id: json['id'] as String,
    phone: json['phone'] as String,
    fullName: json['fullName'] as String?,
    language: json['language'] as String,
    interests: List<String>.unmodifiable(
      (json['interests'] as List).cast<String>(),
    ),
    profileComplete: json['profileComplete'] as bool,
    notifications: json['notifications'] as bool,
  );
  final String id, phone, language;
  final String? fullName;
  final List<String> interests;
  final bool profileComplete, notifications;
  String get firstName => fullName?.split(' ').first ?? 'there';
}

class ProfileDraft {
  const ProfileDraft({
    required this.fullName,
    required this.language,
    required this.interests,
    required this.notifications,
  });
  final String fullName, language;
  final List<String> interests;
  final bool notifications;
  Map<String, dynamic> toJson() => {
    'fullName': fullName.trim(),
    'language': language,
    'interests': interests,
    'notifications': notifications,
  };
  static String? validateName(String? value) {
    final name = value?.trim() ?? '';
    if (name.length < 2 ||
        name.length > 100 ||
        RegExp(r'[\x00-\x1F\x7F]').hasMatch(name)) {
      return 'Enter your name using 2–100 characters.';
    }
    return null;
  }
}
