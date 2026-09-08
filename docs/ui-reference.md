# Mobile visual reference

The user supplied the Pocket Doctor multi-screen concept image on September 8,
2026. It guides the shared navy/green/white palette, pastel service tiles,
rounded input fields, compact navigation, onboarding, personal Home and profile
menu. Assistant messages use distinct readable surfaces. Existing routes,
Riverpod state, permissions and API workflows remain the source of behaviour.

Home keeps Home / Programs / Consult / Assistant / Profile navigation and links
to Wellness Medicines. Service tiles use intrinsic height and wrap at narrow
widths so larger accessibility text does not depend on fixed card heights.
My Health links to real goals, check-ins, reminders and enrolled programs.

The concept's example people, clinical claims, scores, prices and reviews are
not seeded as real data. No new social login or live video provider is implied.
Photos and the standalone approved logo are still needed for matching the
reference artwork. The supplied collage is not used as an application background
or altered to invent a logo. BrandLockup remains a clearly documented text
fallback; see ../apps/mobile/assets/brand/README.md for the final asset location.

Validation uses Flutter analysis, the existing widget/navigation/responsive
suite (including 320px and 2x text cases), and local API smoke journeys. The
visual update does not change backend contracts or production-readiness gates.

September 8 validation: Flutter analysis passed with no issues; all 89 Flutter
tests passed, including the seven local API smoke journeys and responsive
navigation cases. The first run caught profile list tiles painting behind their
card decoration. FoundationCard now provides a Material surface, and the full
suite passed afterward. Android installation was unavailable because the phone
disconnected; it is not reported as a successful updated-device validation.
