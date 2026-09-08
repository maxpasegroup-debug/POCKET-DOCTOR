abstract final class AppRoutes {
  static const splash = '/splash';
  static const welcome = '/welcome';
  static const login = '/login';
  static const otp = '/otp';
  static const profileSetup = '/profile/setup';
  static const shop = '/shop';
  static const wellness = '/wellness';
  static const cart = '/cart';
  static const orders = '/orders';
  static const health = '/health';
  static const settings = '/settings';
  static const notifications = '/notifications';
  static const home = '/home';
  static const programs = '/programs';
  static const consultation = '/consult';
  static const assistant = '/assistant';
  static const profile = '/profile';
  static const membership = '/membership';
  // Reserved patterns, deliberately not registered as working features.
  static const future = <String, String>{
    '/my-consultations': 'My consultations',
  };
}
