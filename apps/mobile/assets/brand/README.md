# Approved logo placement

No approved logo was present in the initial repository. Place the final,
unmodified asset at `assets/brand/pocket_doctor_logo.png` (transparent PNG,
with suitable 2.0x/3.0x variants). Update `BrandLockup` to display it with its
original aspect ratio and accessible label; do not recolor, crop or redraw it.

The current plain-text product name is explicitly a fallback, not a new logo.
The Flutter splash uses the same text fallback. Native launch artwork and web
icons remain separate from the mobile launcher icon.

## Patient launcher icon

The user-supplied Patient app icon is preserved without modification at
`patient_app_icon_source.png` (received 2026-09-12). This launcher asset does not
replace the separate in-app logo automatically.

`patient_app_icon.png` is a derived 1024 × 1024 image: the complete source is fitted
with its original aspect ratio on a white square, without cropping or redrawing.
Android adaptive icons use additional inset padding to preserve the supplied text
under circular and rounded launcher masks. iOS sizes use the same square artwork.

To regenerate Android and iOS launcher assets, from `apps/mobile` run:

```sh
flutter pub get
dart run tool/generate_app_icons.dart
```

Rebuild and install the app to update its launcher icon. Hot reload cannot update
native launcher resources. Small text is retained as supplied and may be difficult
to read at launcher sizes.

Use the wrapper above so existing Xcode build settings are preserved. The pinned
icon generator also matches unrelated Swift asset-symbol settings when updating
the catalog name; the wrapper keeps the project settings intact.
