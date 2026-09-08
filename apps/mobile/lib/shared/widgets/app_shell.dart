import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'brand_lockup.dart';

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.navigationShell});
  final StatefulNavigationShell navigationShell;
  static const destinations = [
    (label: 'Home', icon: Icons.home_outlined, selected: Icons.home_rounded),
    (
      label: 'Programs',
      icon: Icons.auto_stories_outlined,
      selected: Icons.auto_stories,
    ),
    (
      label: 'Consult',
      icon: Icons.medical_services_outlined,
      selected: Icons.medical_services,
    ),
    (
      label: 'Assistant',
      icon: Icons.chat_bubble_outline,
      selected: Icons.chat_bubble,
    ),
    (label: 'Profile', icon: Icons.person_outline, selected: Icons.person),
  ];
  void _select(int index) => navigationShell.goBranch(
    index,
    initialLocation: index == navigationShell.currentIndex,
  );
  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final wide = size.width >= 840 && size.height >= 600;
    final largeText = MediaQuery.textScalerOf(context).scale(14) > 20;
    return Scaffold(
      appBar: AppBar(
        title: const BrandLockup(),
        toolbarHeight: largeText ? 100 : 56,
        automaticallyImplyLeading: false,
        actions: [
          IconButton(
            tooltip: 'Notifications',
            onPressed: () => context.push('/notifications'),
            icon: const Icon(Icons.notifications_none_rounded),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Row(
          children: [
            if (wide) ...[
              NavigationRail(
                selectedIndex: navigationShell.currentIndex,
                onDestinationSelected: _select,
                labelType: NavigationRailLabelType.all,
                destinations: [
                  for (final item in destinations)
                    NavigationRailDestination(
                      icon: Icon(item.icon),
                      selectedIcon: Icon(item.selected),
                      label: Text(item.label),
                    ),
                ],
              ),
              const VerticalDivider(width: 1),
            ],
            Expanded(child: navigationShell),
          ],
        ),
      ),
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: navigationShell.currentIndex,
              onDestinationSelected: _select,
              labelBehavior: largeText
                  ? NavigationDestinationLabelBehavior.onlyShowSelected
                  : NavigationDestinationLabelBehavior.alwaysShow,
              destinations: [
                for (final item in destinations)
                  NavigationDestination(
                    icon: Icon(item.icon),
                    selectedIcon: Icon(item.selected),
                    label: item.label,
                    tooltip: item.label,
                  ),
              ],
            ),
    );
  }
}
