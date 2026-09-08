import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_doctor/core/networking/health_repository.dart';

void main() {
  const enabled = bool.fromEnvironment('RUN_API_SMOKE');
  test(
    'Flutter provider connects to the real backend health endpoint',
    () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final subscription = container.listen(apiHealthProvider, (_, _) {});
      addTearDown(subscription.close);
      expect(await container.read(apiHealthProvider.future), true);
    },
    skip: !enabled,
  );
}
