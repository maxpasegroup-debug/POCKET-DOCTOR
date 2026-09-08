typedef Json = Map<String, dynamic>;
String money(int paise) => 'INR ${(paise / 100).toStringAsFixed(2)}';
List<T> decodeList<T>(dynamic value, T Function(Json) decode) =>
    (value as List).map((e) => decode(e as Json)).toList();

class WellnessCategory {
  WellnessCategory.fromJson(Json j)
    : id = j['id'] as String,
      name = j['name'] as String;
  final String id, name;
}

class WellnessProduct {
  WellnessProduct.fromJson(Json j)
    : id = j['id'] as String,
      name = j['name'] as String,
      description = j['description'] as String,
      shortDescription = j['shortDescription'] as String,
      categoryId = j['categoryId'] as String,
      brand = j['brand'] as String,
      pricePaise = j['pricePaise'] as int,
      memberPricePaise =
          j['memberPricePaise'] as int? ?? j['pricePaise'] as int,
      membershipRequired = j['membershipRequired'] == true,
      mrpPaise = j['mrpPaise'] as int?,
      availableQuantity = j['availableQuantity'] as int,
      isDemo = j['isDemo'] as bool,
      shippingEligible = j['shippingEligible'] as bool,
      featured = j['featured'] as bool,
      collection = j['collection'] as String,
      images = (j['images'] as List).cast<String>(),
      manufacturer = j['manufacturer'] as String,
      ingredients = j['ingredients'] as String,
      usage = j['usage'] as String,
      warnings = j['warnings'] as String,
      storage = j['storage'] as String,
      quantityLabel = j['quantityLabel'] as String,
      returnPolicy = j['returnPolicy'] as String,
      doctorAssociation = j['doctorAssociation'] as String?;
  final String id,
      name,
      description,
      shortDescription,
      categoryId,
      brand,
      collection,
      manufacturer,
      ingredients,
      usage,
      warnings,
      storage,
      quantityLabel,
      returnPolicy;
  final String? doctorAssociation;
  final int pricePaise, availableQuantity;
  final int memberPricePaise;
  final bool membershipRequired;
  final int? mrpPaise;
  final bool isDemo, shippingEligible, featured;
  final List<String> images;
}

class ProductPage {
  ProductPage.fromJson(Json j)
    : products = decodeList(j['products'], WellnessProduct.fromJson),
      total = j['total'] as int,
      page = j['page'] as int,
      collections = (j['collections'] as List? ?? []).cast<String>();
  final List<WellnessProduct> products;
  final List<String> collections;
  final int total, page;
}

class CartLine {
  CartLine.fromJson(Json j)
    : id = j['id'] as String,
      productId = j['productId'] as String,
      product = j['product'] == null
          ? null
          : WellnessProduct.fromJson(j['product'] as Json),
      quantity = j['quantity'] as int,
      unitPricePaise = j['unitPricePaise'] as int,
      available = j['available'] as bool,
      priceChanged = j['priceChanged'] as bool;
  final String id, productId;
  final WellnessProduct? product;
  final int quantity, unitPricePaise;
  final bool available, priceChanged;
}

class WellnessCart {
  WellnessCart.fromJson(Json j)
    : items = decodeList(j['items'], CartLine.fromJson),
      subtotalPaise = j['subtotalPaise'] as int,
      canCheckout = j['canCheckout'] as bool;
  final List<CartLine> items;
  final int subtotalPaise;
  final bool canCheckout;
}

class DeliveryAddress {
  DeliveryAddress.fromJson(Json j)
    : id = j['id'] as String? ?? '',
      fullName = j['fullName'] as String,
      phone = j['phone'] as String,
      line1 = j['line1'] as String,
      line2 = j['line2'] as String,
      city = j['city'] as String,
      state = j['state'] as String,
      pinCode = j['pinCode'] as String,
      country = j['country'] as String,
      isDefault = j['isDefault'] as bool? ?? false;
  final String id, fullName, phone, line1, line2, city, state, pinCode, country;
  final bool isDefault;
  String get summary =>
      '$fullName\n$line1${line2.isEmpty ? '' : '\n$line2'}\n$city, $state $pinCode\n$country · $phone';
  Json toJson() => {
    'fullName': fullName,
    'phone': phone,
    'line1': line1,
    'line2': line2,
    'city': city,
    'state': state,
    'pinCode': pinCode,
    'country': country,
    'isDefault': isDefault,
  };
}

class CheckoutQuote {
  CheckoutQuote.fromJson(Json j)
    : cart = WellnessCart.fromJson(j),
      quote = j['quote'] as String,
      address = DeliveryAddress.fromJson(j['addressSnapshot'] as Json),
      deliveryPaise = j['deliveryPaise'] as int,
      discountPaise = j['discountPaise'] as int,
      totalPaise = j['totalPaise'] as int,
      isDemo = j['isDemo'] as bool,
      deliveryInformation = j['deliveryInformation'] as String;
  final WellnessCart cart;
  final String quote, deliveryInformation;
  final DeliveryAddress address;
  final int deliveryPaise, discountPaise, totalPaise;
  final bool isDemo;
}

class OrderLine {
  OrderLine.fromJson(Json j)
    : name = j['name'] as String,
      sku = j['sku'] as String,
      quantity = j['quantity'] as int,
      unitPricePaise = j['unitPricePaise'] as int,
      returnPolicy = j['returnPolicy'] as String;
  final String name, sku, returnPolicy;
  final int quantity, unitPricePaise;
}

class OrderEvent {
  OrderEvent.fromJson(Json j)
    : status = j['status'] as String,
      at = DateTime.parse(j['createdAt'] as String);
  final String status;
  final DateTime at;
}

class WellnessOrder {
  WellnessOrder.fromJson(Json j)
    : id = j['id'] as String,
      number = j['orderNumber'] as String,
      status = j['status'] as String,
      paymentStatus = j['paymentStatus'] as String,
      refundStatus = j['refundStatus'] as String,
      createdAt = DateTime.parse(j['createdAt'] as String),
      holdExpiresAt = DateTime.parse(j['holdExpiresAt'] as String),
      subtotalPaise = j['subtotalPaise'] as int,
      deliveryPaise = j['deliveryPaise'] as int,
      discountPaise = j['discountPaise'] as int,
      totalPaise = j['totalPaise'] as int,
      items = decodeList(j['items'], OrderLine.fromJson),
      events = decodeList(j['events'], OrderEvent.fromJson),
      address = DeliveryAddress.fromJson(j['addressSnapshot'] as Json),
      isDemo = j['isDemo'] as bool,
      cancellable = j['cancellable'] as bool,
      deliveryInformation = j['deliveryInformation'] as String,
      carrier = j['carrier'] as String?,
      trackingNumber = j['trackingNumber'] as String?;
  final String id,
      number,
      status,
      paymentStatus,
      refundStatus,
      deliveryInformation;
  final String? carrier, trackingNumber;
  final DateTime createdAt, holdExpiresAt;
  final int subtotalPaise, deliveryPaise, discountPaise, totalPaise;
  final List<OrderLine> items;
  final List<OrderEvent> events;
  final DeliveryAddress address;
  final bool isDemo, cancellable;
  bool get confirmed => paymentStatus == 'VERIFIED' && status != 'CANCELLED';
}

class OrderPage {
  OrderPage.fromJson(Json j)
    : orders = decodeList(j['orders'], WellnessOrder.fromJson),
      total = j['total'] as int,
      page = j['page'] as int;
  final List<WellnessOrder> orders;
  final int total, page;
}

class CommercePayment {
  CommercePayment.fromJson(Json j)
    : id = j['id'] as String,
      mode = j['mode'] as String,
      amountPaise = j['amountPaise'] as int;
  final String id, mode;
  final int amountPaise;
}
