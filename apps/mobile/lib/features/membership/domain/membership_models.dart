String membershipMoney(int paise) => '₹${(paise / 100).toStringAsFixed(2)}';
String membershipDate(String? value) => value == null
    ? 'Not scheduled'
    : DateTime.parse(value).toLocal().toString().substring(0, 10);

class MembershipPlan {
  MembershipPlan(this.data);
  final Map<String, dynamic> data;
  String get id => data['id'] as String;
  String get name => data['name'] as String;
  String get description => data['description'] as String;
  int get price => data['pricePaise'] as int;
  String get interval => data['interval'] == 'YEAR' ? 'year' : 'month';
  bool get demo => data['isDemo'] == true;
  int get trialDays => data['trialDays'] as int? ?? 0;
  List<String> get benefits => (data['benefits'] as List)
      .map((v) => (v as Map)['label'] as String)
      .toList();
}

class MembershipSubscription {
  MembershipSubscription(this.data);
  final Map<String, dynamic> data;
  String get id => data['id'] as String;
  String get planId => data['planId'] as String;
  String get name => data['name'] as String;
  String get status => data['status'] as String;
  String get endDate => membershipDate(data['periodEnd'] as String?);
  int get price => data['pricePaise'] as int;
  String get interval => data['interval'] == 'YEAR' ? 'year' : 'month';
  bool get demo => data['mode'] == 'development';
  bool get trial => data['isTrial'] == true;
  List<String> get benefits => (data['benefits'] as List)
      .map((v) => (v as Map)['label'] as String)
      .toList();
}

class CurrentMembership {
  CurrentMembership(Map<String, dynamic> json)
    : subscription = json['subscription'] == null
          ? null
          : MembershipSubscription(
              Map<String, dynamic>.from(json['subscription'] as Map),
            ),
      entitled = json['entitled'] == true;
  final MembershipSubscription? subscription;
  final bool entitled;
}

class MembershipQuote {
  MembershipQuote(this.data);
  final Map<String, dynamic> data;
  MembershipPlan get plan =>
      MembershipPlan(Map<String, dynamic>.from(data['plan'] as Map));
  int get amount => data['amountPaise'] as int;
  int get discount => data['discountPaise'] as int;
  int get renewal => data['renewalPricePaise'] as int;
}

class MembershipCheckout {
  MembershipCheckout(Map<String, dynamic> json)
    : subscription = MembershipSubscription(
        Map<String, dynamic>.from(json['subscription'] as Map),
      ),
      payment = json['payment'] == null
          ? null
          : Map<String, dynamic>.from(json['payment'] as Map);
  final MembershipSubscription subscription;
  final Map<String, dynamic>? payment;
  String? get paymentId => payment?['id'] as String?;
  int get amount => payment?['amountPaise'] as int? ?? 0;
}
