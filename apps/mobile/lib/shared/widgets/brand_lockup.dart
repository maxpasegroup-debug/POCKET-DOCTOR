import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

/// Plain-text fallback, not a replacement logo. Install the approved asset at
/// assets/brand/pocket_doctor_logo.png without modification in a later change.
class BrandLockup extends StatelessWidget {
  const BrandLockup({super.key, this.showTagline = false});
  final bool showTagline;
  @override
  Widget build(BuildContext context) => Semantics(
    label:
        'Pocket Doctor${showTagline ? '. Your Doctor. In Your Pocket.' : ''}',
    child: ExcludeSemantics(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'POCKET DOCTOR',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              letterSpacing: 1.4,
              color: AppColors.navy,
            ),
          ),
          if (showTagline) ...[
            const SizedBox(height: 8),
            Text(
              'Your Doctor. In Your Pocket.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ],
      ),
    ),
  );
}
