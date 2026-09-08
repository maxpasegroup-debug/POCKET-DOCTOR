import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class PageBody extends StatelessWidget {
  const PageBody({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    child: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: AppSpacing.contentWidth),
        child: Padding(
          padding: EdgeInsets.all(
            MediaQuery.sizeOf(context).width < 600 ? 20 : AppSpacing.xxl,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: children,
          ),
        ),
      ),
    ),
  );
}

class SectionHeading extends StatelessWidget {
  const SectionHeading({
    super.key,
    required this.eyebrow,
    required this.title,
    required this.description,
  });
  final String eyebrow, title, description;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        eyebrow.toUpperCase(),
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
          color: AppColors.green,
          letterSpacing: 1.4,
        ),
      ),
      const SizedBox(height: 10),
      Text(title, style: Theme.of(context).textTheme.headlineMedium),
      const SizedBox(height: 12),
      Text(description, style: Theme.of(context).textTheme.bodyLarge),
      const SizedBox(height: 24),
    ],
  );
}

class StatusPill extends StatelessWidget {
  const StatusPill({super.key, this.label = 'Coming in a later phase'});
  final String label;
  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: AppColors.mint,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      child: Text(
        label,
        style: Theme.of(
          context,
        ).textTheme.labelMedium?.copyWith(color: AppColors.green),
      ),
    ),
  );
}

class FoundationCard extends StatelessWidget {
  const FoundationCard({
    super.key,
    required this.child,
    this.color = Colors.white,
  });
  final Widget child;
  final Color color;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: double.infinity,
    child: Material(
      color: color,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: AppColors.border),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Padding(padding: const EdgeInsets.all(20), child: child),
    ),
  );
}

class FeaturePlaceholder extends StatelessWidget {
  const FeaturePlaceholder({
    super.key,
    required this.eyebrow,
    required this.title,
    required this.description,
    required this.icon,
    required this.emptyTitle,
    required this.emptyDescription,
    this.mentalWellness = false,
  });
  final String eyebrow, title, description, emptyTitle, emptyDescription;
  final IconData icon;
  final bool mentalWellness;
  @override
  Widget build(BuildContext context) => PageBody(
    children: [
      SectionHeading(eyebrow: eyebrow, title: title, description: description),
      FoundationCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                color: mentalWellness ? AppColors.lavender : AppColors.mint,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Icon(
                  icon,
                  size: 32,
                  color: mentalWellness ? AppColors.violet : AppColors.green,
                ),
              ),
            ),
            const SizedBox(height: 24),
            Text(emptyTitle, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            Text(
              emptyDescription,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 24),
            const StatusPill(),
          ],
        ),
      ),
    ],
  );
}
