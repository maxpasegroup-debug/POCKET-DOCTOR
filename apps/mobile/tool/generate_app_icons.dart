import 'dart:io';
import 'package:image/image.dart' as img;

// Run from apps/mobile. Keep the supplied artwork byte-for-byte in the source
// asset; only the derived launcher asset is fitted onto a square white canvas.
void main() {
  final sourceFile = File('assets/brand/patient_app_icon_source.png');
  final source = img.decodePng(sourceFile.readAsBytesSync());
  if (source == null) {
    throw StateError('The Patient icon source must be a valid PNG.');
  }
  final square = img.copyResize(
    source,
    width: 1024,
    height: 1024,
    maintainAspect: true,
    backgroundColor: img.ColorRgb8(255, 255, 255),
    interpolation: img.Interpolation.cubic,
  );
  File(
    'assets/brand/patient_app_icon.png',
  ).writeAsBytesSync(img.encodePng(square));
  stdout.writeln(
    'Prepared square launcher artwork with its original aspect ratio.',
  );

  // AppIcon is already selected in Xcode. The generator's broad asset-catalog
  // replacement also matches Swift asset-symbol settings in recent projects.
  // Generate the image catalog while preserving all existing Xcode settings.
  final project = File('ios/Runner.xcodeproj/project.pbxproj');
  if (!project.readAsStringSync().contains(
    'ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;',
  )) {
    throw StateError('The iOS project must already use the AppIcon catalog.');
  }
  final projectBytes = project.readAsBytesSync();
  try {
    final result = Process.runSync(Platform.resolvedExecutable, [
      'run',
      'flutter_launcher_icons',
    ]);
    stdout.write(result.stdout);
    stderr.write(result.stderr);
    exitCode = result.exitCode;
  } finally {
    project.writeAsBytesSync(projectBytes);
  }
}
