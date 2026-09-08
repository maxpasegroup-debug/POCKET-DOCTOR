import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import 'brand_lockup.dart';
import 'foundation_widgets.dart';

class ActionButton extends StatelessWidget {
  const ActionButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.busy = false,
  });
  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: double.infinity,
    child: FilledButton(
      onPressed: busy ? null : onPressed,
      child: busy
          ? Semantics(
              label: 'Please wait',
              child: const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          : Text(label, textAlign: TextAlign.center),
    ),
  );
}

class ErrorNotice extends StatelessWidget {
  const ErrorNotice({super.key, required this.message, this.onRetry});
  final String message;
  final VoidCallback? onRetry;
  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            message,
            style: const TextStyle(color: AppColors.error, height: 1.5),
          ),
          if (onRetry != null)
            TextButton(onPressed: onRetry, child: const Text('Try again')),
        ],
      ),
    ),
  );
}

class AuthPage extends StatelessWidget {
  const AuthPage({
    super.key,
    required this.title,
    required this.description,
    required this.children,
    this.onBack,
  });
  final String title, description;
  final List<Widget> children;
  final VoidCallback? onBack;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: onBack == null
        ? null
        : AppBar(
            leading: IconButton(
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back),
              tooltip: 'Back',
            ),
          ),
    body: SafeArea(
      child: SingleChildScrollView(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const BrandLockup(showTagline: true),
                  const SizedBox(height: 48),
                  Text(
                    title,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    description,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 32),
                  ...children,
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class DetailPage extends StatelessWidget {
  const DetailPage({
    super.key,
    required this.title,
    required this.children,
    this.onBack,
  });
  final String title;
  final List<Widget> children;
  final VoidCallback? onBack;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(title),
      leading: onBack == null
          ? null
          : IconButton(
              tooltip: 'Back',
              icon: const Icon(Icons.arrow_back),
              onPressed: onBack,
            ),
    ),
    body: SafeArea(top: false, child: PageBody(children: children)),
  );
}

Future<void> showFutureFeature(
  BuildContext context,
  String title,
  String description,
) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (context) => SafeArea(
    child: SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const StatusPill(label: 'Coming soon'),
            const SizedBox(height: 20),
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            Text(description, style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: 24),
            ActionButton(
              label: 'Got it',
              onPressed: () => Navigator.pop(context),
            ),
          ],
        ),
      ),
    ),
  ),
);

class PreviewTile extends StatelessWidget {
  const PreviewTile({
    super.key,
    required this.title,
    required this.description,
    required this.icon,
    this.onTap,
    this.label = 'Coming soon',
  });
  final String title, description, label;
  final IconData icon;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: AppColors.border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: AppColors.green, size: 28),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (label.isNotEmpty) ...[
                      Text(
                        label.toUpperCase(),
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: AppColors.green,
                        ),
                      ),
                      const SizedBox(height: 8),
                    ],
                    Text(title, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 6),
                    Text(description),
                  ],
                ),
              ),
              if (onTap != null)
                const Padding(
                  padding: EdgeInsets.only(left: 8),
                  child: Icon(Icons.arrow_forward, size: 20),
                ),
            ],
          ),
        ),
      ),
    ),
  );
}

class PageSection extends StatelessWidget {
  const PageSection(this.title, {super.key, this.subtitle});
  final String title;
  final String? subtitle;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 24, bottom: 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleLarge),
        if (subtitle != null) ...[const SizedBox(height: 8), Text(subtitle!)],
      ],
    ),
  );
}
