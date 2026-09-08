import '../../../core/networking/api_client.dart';
import '../domain/membership_models.dart';

class MembershipRepository {
  MembershipRepository(this.api);
  final ApiClient api;
  Future<Map<String, dynamic>> request(
    String method,
    String path, [
    Map<String, dynamic>? body,
  ]) => api.request(method, path, body: body, authenticated: true);
  Future<List<MembershipPlan>> plans() async =>
      ((await request('GET', '/membership/plans'))['items'] as List)
          .map((v) => MembershipPlan(Map<String, dynamic>.from(v as Map)))
          .toList();
  Future<CurrentMembership> current() async =>
      CurrentMembership(await request('GET', '/membership/current'));
  Future<MembershipQuote> quote(String id, String code) async =>
      MembershipQuote(
        await request('POST', '/membership/coupon/validate', {
          'planId': id,
          'coupon': code,
        }),
      );
  Future<MembershipCheckout> subscribe(
    String id,
    String code,
    String key, {
    bool trial = false,
    bool renew = false,
  }) async => MembershipCheckout(
    await request('POST', '/membership/subscribe', {
      'planId': id,
      'coupon': code,
      'requestKey': key,
      'trial': trial,
      'renew': renew,
    }),
  );
  Future<bool> settle(String id, bool capture) async =>
      (await request('POST', '/membership/payments/$id/development-settle', {
        'outcome': capture ? 'capture' : 'fail',
      }))['verified'] ==
      true;
  Future<void> manage(String id, bool reactivate) async {
    await request(
      'POST',
      '/membership/$id/${reactivate ? 'reactivate' : 'cancel'}',
      {},
    );
  }

  Future<List<Map<String, dynamic>>> transactions(int page) async =>
      ((await api.request(
                'GET',
                '/me/revenue/transactions',
                query: {'page': '$page'},
                authenticated: true,
              ))['items']
              as List)
          .map((v) => Map<String, dynamic>.from(v as Map))
          .toList();
  Future<Map<String, dynamic>> invoice(String id) async =>
      (await request('GET', '/me/invoices/$id'))['item']
          as Map<String, dynamic>;
}
