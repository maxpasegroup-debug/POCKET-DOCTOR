import 'package:http/http.dart' as http;
import 'package:pocket_doctor/core/networking/api_client.dart';
import 'package:pocket_doctor/features/membership/data/membership_repository.dart';
import 'package:pocket_doctor/features/membership/domain/membership_models.dart';

class FakeMembershipRepository extends MembershipRepository {
  FakeMembershipRepository()
    : super(ApiClient(http.Client(), Uri.parse('http://localhost')));
  bool fail = false, empty = false, active = false;
  String status = 'ACTIVE', code = '';
  int cancellations = 0, payments = 0;
  final plan = {
    'id': 'plan',
    'name': 'Pocket Doctor Plus',
    'description': 'Optional learning and wellness support.',
    'pricePaise': 19900,
    'interval': 'MONTH',
    'isDemo': true,
    'trialDays': 7,
    'benefits': [
      {'label': 'Selected demo programs'},
    ],
  };
  Map<String, dynamic> get subscription => {
    'id': 'subscription',
    'planId': 'plan',
    'name': 'Pocket Doctor Plus',
    'status': status,
    'pricePaise': 19900,
    'interval': 'MONTH',
    'mode': 'development',
    'periodEnd': '2027-01-01T00:00:00Z',
    'isTrial': false,
    'benefits': plan['benefits'],
  };
  void check() {
    if (fail) throw const ApiFailure('Connection unavailable.');
  }

  @override
  Future<Map<String, dynamic>> request(
    String method,
    String path, [
    Map<String, dynamic>? body,
  ]) async {
    check();
    if (path == '/membership/events') {
      return {'items': <Map<String, dynamic>>[]};
    }
    throw StateError('Unexpected membership test request');
  }

  @override
  Future<List<MembershipPlan>> plans() async {
    check();
    return empty ? [] : [MembershipPlan(plan)];
  }

  @override
  Future<CurrentMembership> current() async {
    check();
    return CurrentMembership({
      'subscription': active ? subscription : null,
      'entitled': active && status != 'EXPIRED',
    });
  }

  @override
  Future<MembershipQuote> quote(String id, String code) async {
    check();
    this.code = code;
    return MembershipQuote({
      'plan': plan,
      'amountPaise': code == 'SAVE' ? 15920 : 19900,
      'discountPaise': code == 'SAVE' ? 3980 : 0,
      'renewalPricePaise': 19900,
    });
  }

  @override
  Future<MembershipCheckout> subscribe(
    String id,
    String code,
    String key, {
    bool trial = false,
    bool renew = false,
  }) async {
    check();
    return MembershipCheckout({
      'subscription': subscription,
      'payment': trial
          ? null
          : {'id': 'payment', 'amountPaise': code == 'SAVE' ? 15920 : 19900},
    });
  }

  @override
  Future<bool> settle(String id, bool capture) async {
    check();
    payments++;
    active = capture;
    return capture;
  }

  @override
  Future<void> manage(String id, bool reactivate) async {
    check();
    cancellations++;
    status = reactivate ? 'ACTIVE' : 'CANCELLED';
  }

  @override
  Future<List<Map<String, dynamic>>> transactions(int page) async {
    check();
    return empty
        ? []
        : [
            {
              'id': 'payment',
              'amountPaise': 19900,
              'status': 'VERIFIED',
              'subscriptionId': 'subscription',
              'provider': 'development',
              'createdAt': '2026-09-07T00:00:00Z',
              'invoice': {'id': 'invoice'},
            },
          ];
  }

  @override
  Future<Map<String, dynamic>> invoice(String id) async {
    check();
    return {
      'id': id,
      'number': 'PD-DEMO-RECEIPT',
      'source': 'MEMBERSHIP',
      'status': 'RECEIPT',
      'issuedAt': '2026-09-07T00:00:00Z',
      'amountPaise': 19900,
      'currency': 'INR',
      'payment': {'provider': 'development'},
    };
  }
}
