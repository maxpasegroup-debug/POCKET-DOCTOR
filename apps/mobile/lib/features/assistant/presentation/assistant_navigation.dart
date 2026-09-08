import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import '../domain/assistant_models.dart';

void openAssistantDestination(BuildContext context, String route) {
  if (!validAssistantRoute(route)) return;
  // Existing StatefulShellRoute branches must change location rather than push
  // another shell with the same navigator keys onto the stack.
  if (const ['/consult', '/programs', '/assistant'].contains(route)) {
    context.go(route);
  } else {
    context.push(route);
  }
}
