import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_doctor/features/programs/application/program_providers.dart';
import 'package:pocket_doctor/features/membership/application/membership_providers.dart';
import 'package:pocket_doctor/features/programs/domain/program_models.dart';
import 'package:pocket_doctor/features/wellness/application/commerce_providers.dart';
import 'package:pocket_doctor/features/wellness/domain/commerce_models.dart';
import '../helpers/program_fakes.dart';
import '../helpers/membership_fakes.dart';
import '../helpers/commerce_fakes.dart';

class MemberPrograms extends FakeProgramRepository {
  MemberPrograms(this.membership);
  final FakeMembershipRepository membership;
  @override
  Future<Program> detail(String id) async => Program.fromJson({
    ...sampleProgram(paid: true),
    'memberAccess': membership.active,
  });
}

class MemberCommerce extends FakeCommerceRepository {
  MemberCommerce(this.membership);
  final FakeMembershipRepository membership;
  @override
  Future<WellnessProduct> product(String id) async => WellnessProduct.fromJson({
    ...demoProductJson,
    'memberPricePaise': membership.active ? 28000 : 35000,
  });
  @override
  Future<WellnessCart> cart() async => WellnessCart.fromJson({
    ...cartJson(),
    'subtotalPaise': membership.active ? 28000 : 35000,
  });
}

void main() {
  test(
    'joining a program refreshes the already loaded Home enrollment badge',
    () async {
      final repo = FakeProgramRepository();
      final c = ProviderContainer(
        overrides: [programRepositoryProvider.overrideWithValue(repo)],
      );
      addTearDown(c.dispose);
      final subscription = c.listen(programActionsProvider, (_, _) {});
      addTearDown(subscription.close);
      expect(
        (await c.read(homeProgramsProvider.future)).single.enrolled,
        isFalse,
      );
      expect(
        await c.read(programActionsProvider.notifier).enroll(testProgramId),
        isTrue,
      );
      expect(
        (await c.read(homeProgramsProvider.future)).single.enrolled,
        isTrue,
      );
    },
  );

  test(
    'verified membership refreshes open program access, product price and cart',
    () async {
      final membership = FakeMembershipRepository();
      final c = ProviderContainer(
        overrides: [
          membershipRepositoryProvider.overrideWithValue(membership),
          programRepositoryProvider.overrideWithValue(
            MemberPrograms(membership),
          ),
          commerceRepositoryProvider.overrideWithValue(
            MemberCommerce(membership),
          ),
        ],
      );
      addTearDown(c.dispose);
      final actions = c.listen(membershipActionsProvider, (_, _) {});
      final program = c.listen(programDetailProvider(testProgramId), (_, _) {});
      final product = c.listen(wellnessProductProvider('product'), (_, _) {});
      addTearDown(actions.close);
      addTearDown(program.close);
      addTearDown(product.close);
      expect(
        (await c.read(
          programDetailProvider(testProgramId).future,
        )).memberAccess,
        isFalse,
      );
      expect(
        (await c.read(
          wellnessProductProvider('product').future,
        )).memberPricePaise,
        35000,
      );
      expect((await c.read(wellnessCartProvider.future)).subtotalPaise, 35000);
      expect(
        await c
            .read(membershipActionsProvider.notifier)
            .settle('payment', true),
        isTrue,
      );
      expect(
        (await c.read(
          programDetailProvider(testProgramId).future,
        )).memberAccess,
        isTrue,
      );
      expect(
        (await c.read(
          wellnessProductProvider('product').future,
        )).memberPricePaise,
        28000,
      );
      expect((await c.read(wellnessCartProvider.future)).subtotalPaise, 28000);
    },
  );
}
