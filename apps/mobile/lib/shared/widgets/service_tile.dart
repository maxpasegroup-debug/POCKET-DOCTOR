import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

/// A compact service entry with an intrinsic height for larger accessibility text.
class ServiceTile extends StatelessWidget {
  const ServiceTile({
    super.key,
    required this.title,
    required this.icon,
    required this.color,
    required this.background,
    required this.onTap,
  });
  final String title;
  final IconData icon;
  final Color color, background;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: background,
    borderRadius: BorderRadius.circular(18),
    child: InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 30, color: color),
            const SizedBox(height: 10),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                color: AppColors.navy,
                fontWeight: FontWeight.w700,
                height: 1.35,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class ServiceGrid extends StatelessWidget {
  const ServiceGrid({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final count = constraints.maxWidth >= 720 ? 4 : 2;
      final width = (constraints.maxWidth - (count - 1) * 12) / count;
      return Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          for (final child in children) SizedBox(width: width, child: child),
        ],
      );
    },
  );
}
