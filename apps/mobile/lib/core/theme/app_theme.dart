import 'package:flutter/material.dart';

abstract final class AppColors {
  static const navy = Color(0xFF142E40);
  static const green = Color(0xFF17634B);
  static const canvas = Color(0xFFF7F9F7);
  static const mint = Color(0xFFE8F2EB);
  static const muted = Color(0xFF53666E);
  static const border = Color(0xFFD9E2DD);
  static const lavender = Color(0xFFEEEAF6);
  static const violet = Color(0xFF635080);
  static const information = Color(0xFF245A7B);
  static const warning = Color(0xFF825600);
  static const error = Color(0xFFAE303B);
}

abstract final class AppSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 16.0;
  static const lg = 24.0;
  static const xl = 32.0;
  static const xxl = 48.0;
  static const contentWidth = 960.0;
}

abstract final class AppTheme {
  static final light = ThemeData(
    useMaterial3: true,
    scaffoldBackgroundColor: AppColors.canvas,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.green,
      primary: AppColors.green,
      onPrimary: Colors.white,
      secondary: AppColors.navy,
      surface: Colors.white,
      onSurface: AppColors.navy,
      error: AppColors.error,
      outline: AppColors.border,
    ),
    textTheme: const TextTheme(
      displaySmall: TextStyle(
        fontSize: 38,
        height: 1.15,
        fontWeight: FontWeight.w700,
        letterSpacing: -1.2,
        color: AppColors.navy,
      ),
      headlineMedium: TextStyle(
        fontSize: 28,
        height: 1.2,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.6,
        color: AppColors.navy,
      ),
      titleLarge: TextStyle(
        fontSize: 22,
        height: 1.3,
        fontWeight: FontWeight.w600,
        color: AppColors.navy,
      ),
      titleMedium: TextStyle(
        fontSize: 17,
        height: 1.4,
        fontWeight: FontWeight.w600,
        color: AppColors.navy,
      ),
      bodyLarge: TextStyle(fontSize: 16, height: 1.55, color: AppColors.muted),
      bodyMedium: TextStyle(fontSize: 14, height: 1.5, color: AppColors.muted),
      labelLarge: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.canvas,
      foregroundColor: AppColors.navy,
      scrolledUnderElevation: 0,
    ),
    dividerTheme: const DividerThemeData(color: AppColors.border, space: 1),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(48, 52),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(48, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: AppColors.mint,
      elevation: 0,
      height: 76,
    ),
    navigationRailTheme: const NavigationRailThemeData(
      backgroundColor: Colors.white,
      indicatorColor: AppColors.mint,
    ),
  );
}
