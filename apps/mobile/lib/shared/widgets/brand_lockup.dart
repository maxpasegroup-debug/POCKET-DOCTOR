import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

/// Plain-text fallback, not a replacement logo. Install the approved asset at
/// assets/brand/pocket_doctor_logo.png without modification in a later change.
class BrandLockup extends StatelessWidget {
  const BrandLockup({super.key, this.showTagline = false, this.onDark = false});
  final bool showTagline;
  final bool onDark;
  @override
  Widget build(BuildContext context) => Semantics(
    label:
        'Pocket Doctor${showTagline ? '. Your Doctor. In Your Pocket.' : ''}',
    child: ExcludeSemantics(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: 'POCKET ',
                  style: TextStyle(
                    color: onDark ? Colors.white : AppColors.navy,
                  ),
                ),
                TextSpan(
                  text: 'DOCTOR',
                  style: TextStyle(
                    color: onDark ? const Color(0xFF72E7A3) : AppColors.green,
                  ),
                ),
              ],
            ),
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              letterSpacing: 1.6,
              fontWeight: FontWeight.w800,
            ),
          ),
          if (showTagline) ...[
            const SizedBox(height: 8),
            Text(
              'Your Doctor. In Your Pocket.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: onDark ? Colors.white : AppColors.muted,
              ),
            ),
          ],
        ],
      ),
    ),
  );
}
