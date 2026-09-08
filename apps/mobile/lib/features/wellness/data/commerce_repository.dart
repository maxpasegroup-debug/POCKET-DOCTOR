import '../../../core/networking/api_client.dart';
import '../domain/commerce_models.dart';

class CommerceRepository {
  CommerceRepository(this.api);
  final ApiClient api;
  Future<Json> _get(String path, [Map<String, String>? query]) =>
      api.request('GET', path, query: query, authenticated: true);
  Future<Json> _send(String method, String path, [Json? body]) =>
      api.request(method, path, body: body, authenticated: true);
  Future<ProductPage> discover(Map<String, String> filters) async =>
      ProductPage.fromJson(await _get('/wellness/products', filters));
  Future<List<WellnessCategory>> categories() async => decodeList(
    (await _get('/wellness/categories'))['categories'],
    WellnessCategory.fromJson,
  );
  Future<WellnessProduct> product(String id) async => WellnessProduct.fromJson(
    (await _get('/wellness/products/$id'))['product'] as Json,
  );
  Future<WellnessCart> cart() async =>
      WellnessCart.fromJson(await _get('/me/cart'));
  Future<WellnessCart> setCart(String productId, int quantity) async =>
      WellnessCart.fromJson(
        await _send('POST', '/me/cart/items', {
          'productId': productId,
          'quantity': quantity,
        }),
      );
  Future<WellnessCart> removeCart(String id) async =>
      WellnessCart.fromJson(await _send('DELETE', '/me/cart/items/$id'));
  Future<List<DeliveryAddress>> addresses() async => decodeList(
    (await _get('/me/addresses'))['addresses'],
    DeliveryAddress.fromJson,
  );
  Future<DeliveryAddress> saveAddress(Json input, [String? id]) async =>
      DeliveryAddress.fromJson(
        (await _send(
              id == null ? 'POST' : 'PATCH',
              '/me/addresses${id == null ? '' : '/$id'}',
              input,
            ))['address']
            as Json,
      );
  Future<bool> deleteAddress(String id) async {
    await _send('DELETE', '/me/addresses/$id');
    return true;
  }

  Future<CheckoutQuote> checkout(String addressId) async =>
      CheckoutQuote.fromJson(
        await _send('POST', '/checkout', {'addressId': addressId}),
      );
  Future<WellnessOrder> createOrder(
    String addressId,
    String quote,
    String key,
  ) async => WellnessOrder.fromJson(
    (await _send('POST', '/orders', {
          'addressId': addressId,
          'quote': quote,
          'idempotencyKey': key,
        }))['order']
        as Json,
  );
  Future<OrderPage> orders(int page) async =>
      OrderPage.fromJson(await _get('/me/orders', {'page': '$page'}));
  Future<WellnessOrder> order(String id) async =>
      WellnessOrder.fromJson((await _get('/me/orders/$id'))['order'] as Json);
  Future<CommercePayment> payment(String id) async => CommercePayment.fromJson(
    (await _send('POST', '/orders/$id/payment', {}))['payment'] as Json,
  );
  Future<WellnessOrder> settle(String id, bool capture) async =>
      WellnessOrder.fromJson(
        (await _send('POST', '/order-payments/$id/development-settle', {
              'outcome': capture ? 'capture' : 'fail',
            }))['order']
            as Json,
      );
  Future<WellnessOrder> cancel(String id) async => WellnessOrder.fromJson(
    (await _send('POST', '/orders/$id/cancel', {}))['order'] as Json,
  );
}
