import 'package:http/http.dart' as http;
import 'package:pocket_doctor/core/networking/api_client.dart';
import 'package:pocket_doctor/features/wellness/data/commerce_repository.dart';
import 'package:pocket_doctor/features/wellness/domain/commerce_models.dart';

final demoProductJson = <String, dynamic>{
  'id': 'product',
  'name': 'DEMO Everyday Bottle',
  'description': 'Sample product for testing only.',
  'shortDescription': 'A sample everyday essential.',
  'categoryId': 'daily',
  'brand': 'DEMO',
  'pricePaise': 35000,
  'mrpPaise': 40000,
  'availableQuantity': 10,
  'isDemo': true,
  'shippingEligible': true,
  'featured': true,
  'collection': 'Everyday care',
  'images': <String>[],
  'manufacturer': 'No real manufacturer',
  'ingredients': 'Sample material',
  'usage': 'Sample usage',
  'warnings': 'DEMO only',
  'storage': 'Sample storage',
  'quantityLabel': '1 bottle',
  'returnPolicy': 'DEMO returns policy',
  'doctorAssociation': null,
};
final demoAddressJson = <String, dynamic>{
  'id': 'address',
  'fullName': 'DEMO Recipient',
  'phone': '+919999900404',
  'line1': 'Test address',
  'line2': '',
  'city': 'Test city',
  'state': 'Test state',
  'pinCode': '560001',
  'country': 'IN',
  'isDefault': true,
};

class FakeCommerceRepository extends CommerceRepository {
  FakeCommerceRepository({this.empty = false})
    : super(ApiClient(http.Client(), Uri.parse('http://localhost/api/v1')));
  final bool empty;
  bool fail = false;
  bool priceChanged = false;
  bool available = true;
  int quantity = 0;
  String? status;
  Map<String, String> lastQuery = {};
  Duration delay = Duration.zero;
  final List<DeliveryAddress> saved = [];
  void check() {
    if (fail) {
      throw const ApiFailure('Connection interrupted. Please try again.');
    }
  }

  Json cartJson() => {
    'items': quantity == 0
        ? <Json>[]
        : [
            {
              'id': 'line',
              'productId': 'product',
              'product': demoProductJson,
              'quantity': quantity,
              'unitPricePaise': 35000,
              'available': available,
              'priceChanged': priceChanged,
            },
          ],
    'subtotalPaise': quantity * 35000,
    'canCheckout': quantity > 0 && available,
  };
  WellnessOrder snapshot() => WellnessOrder.fromJson({
    'id': 'order',
    'orderNumber': 'PD-DEMO',
    'status': status ?? 'PENDING_PAYMENT',
    'paymentStatus': ['CONFIRMED', 'DELIVERED', 'CANCELLED'].contains(status)
        ? 'VERIFIED'
        : 'PENDING',
    'refundStatus': status == 'CANCELLED' ? 'REQUESTED' : 'NOT_REQUIRED',
    'createdAt': '2026-09-07T09:00:00Z',
    'holdExpiresAt': '2026-09-07T09:10:00Z',
    'subtotalPaise': 35000,
    'deliveryPaise': 5000,
    'discountPaise': 0,
    'totalPaise': 40000,
    'addressSnapshot': demoAddressJson,
    'isDemo': true,
    'cancellable': ['PENDING_PAYMENT', 'CONFIRMED'].contains(status),
    'deliveryInformation': 'DEMO order. No delivery.',
    'carrier': null,
    'trackingNumber': null,
    'items': [
      {
        'name': 'DEMO Everyday Bottle',
        'sku': 'DEMO-1',
        'quantity': 1,
        'unitPricePaise': 35000,
        'returnPolicy': 'DEMO returns policy',
      },
    ],
    'events': [
      {
        'status': status ?? 'PENDING_PAYMENT',
        'createdAt': '2026-09-07T09:00:00Z',
      },
    ],
  });
  @override
  Future<ProductPage> discover(Map<String, String> filters) async {
    check();
    lastQuery = filters;
    return ProductPage.fromJson({
      'products': empty || filters['q'] == 'unknown'
          ? <Json>[]
          : [demoProductJson],
      'page': 1,
      'total': empty ? 0 : 1,
    });
  }

  @override
  Future<List<WellnessCategory>> categories() async {
    check();
    return [
      WellnessCategory.fromJson({'id': 'daily', 'name': 'Daily Wellness'}),
    ];
  }

  @override
  Future<WellnessProduct> product(String id) async {
    check();
    return WellnessProduct.fromJson(demoProductJson);
  }

  @override
  Future<WellnessCart> cart() async {
    check();
    return WellnessCart.fromJson(cartJson());
  }

  @override
  Future<WellnessCart> setCart(String productId, int quantity) async {
    check();
    this.quantity = quantity;
    return cart();
  }

  @override
  Future<WellnessCart> removeCart(String id) async {
    check();
    quantity = 0;
    return cart();
  }

  @override
  Future<List<DeliveryAddress>> addresses() async {
    check();
    return [...saved];
  }

  @override
  Future<DeliveryAddress> saveAddress(Json input, [String? id]) async {
    check();
    final address = DeliveryAddress.fromJson({...input, 'id': id ?? 'address'});
    saved.removeWhere((a) => a.id == address.id);
    saved.add(address);
    return address;
  }

  @override
  Future<bool> deleteAddress(String id) async {
    check();
    saved.removeWhere((a) => a.id == id);
    return true;
  }

  @override
  Future<CheckoutQuote> checkout(String addressId) async {
    check();
    return CheckoutQuote.fromJson({
      ...cartJson(),
      'quote': 'quote',
      'addressSnapshot': demoAddressJson,
      'deliveryPaise': 5000,
      'discountPaise': 0,
      'totalPaise': quantity * 35000 + 5000,
      'isDemo': true,
      'deliveryInformation': 'DEMO shipping',
    });
  }

  @override
  Future<WellnessOrder> createOrder(
    String addressId,
    String quote,
    String key,
  ) async {
    check();
    status ??= 'PENDING_PAYMENT';
    return snapshot();
  }

  @override
  Future<OrderPage> orders(int page) async {
    check();
    return OrderPage.fromJson({'orders': <Json>[], 'total': 0, 'page': 1});
  }

  @override
  Future<WellnessOrder> order(String id) async {
    check();
    await Future<void>.delayed(delay);
    return snapshot();
  }

  @override
  Future<CommercePayment> payment(String id) async {
    check();
    return CommercePayment.fromJson({
      'id': 'payment',
      'mode': 'development',
      'amountPaise': 40000,
    });
  }

  @override
  Future<WellnessOrder> settle(String id, bool capture) async {
    check();
    status = capture ? 'CONFIRMED' : 'PAYMENT_FAILED';
    return snapshot();
  }

  @override
  Future<WellnessOrder> cancel(String id) async {
    check();
    status = 'CANCELLED';
    return snapshot();
  }
}
