# Pocket Doctor design system

Phase 1 extends the original tokens with AuthPage, ActionButton, ErrorNotice,
DetailPage, PreviewTile and PageSection. PreviewTile is shared across service,
program, doctor-discovery and wellness-collection presentations to avoid duplicated
card implementations. OTP uses one accessible six-digit field with paste/autofill
support. Profile forms validate before submission and retain input after API errors.
Onboarding has three pages with Skip/Next/Get started. Saved identity and interests
personalize Home; no progress percentages, diagnoses or fictitious clinical scores
are shown. The approved logo is still absent and the shared text fallback remains.

The visual tone is calm, human and trustworthy. The app uses flat color, generous
space, simple outlines and clear language. There are no medical dashboards, fake
metrics, gradients, stock doctors, animated chat or invented testimonials.

| Token | Color | Purpose |
| --- | --- | --- |
| Navy | `#142E40` | Primary text and brand fallback |
| Medical green | `#17634B` | Primary actions and selected state |
| White | `#FFFFFF` | Cards and navigation |
| Canvas | `#F7F9F7` | Page background |
| Mint | `#E8F2EB` | Calm emphasis and selection |
| Muted text | `#53666E` | Supporting text |
| Border | `#D9E2DD` | Subtle structure |
| Violet / lavender | `#635080` / `#EEEAF6` | Carefully scoped companion/wellbeing accent |
| Information | `#245A7B` | Future informational states |
| Warning | `#825600` | Future warnings |
| Error | `#AE303B` | Error states |

Material typography uses platform fallbacks, without network font dependencies.
Scale: 38 display, 28 headline, 22/17 titles, 16/14 body. Body line-height is 1.5–1.55.
Spacing follows 4/8/16/24/32/48; cards use 16–20px corner radii and actions 14px.
Text scales with accessibility settings. Pages scroll instead of clipping content.

Reusable components: `BrandLockup`, `PageBody`, `SectionHeading`, `FoundationCard`,
`StatusPill`, `FeaturePlaceholder` and `AppShell`. Content is constrained to 960px;
phones have 24px page padding, wider layouts 48px. Navigation switches to a side
rail when the viewport is at least 840×600; short landscape layouts keep bottom
navigation. At large text sizes, only the selected bottom label is shown, with
accessible labels/tooltips retained for all destinations. Actions use at least
48px targets. Meaning is communicated with text as well as color.

## Approved logo

No approved asset was supplied. `apps/mobile/assets/brand/README.md` reserves
`pocket_doctor_logo.png`. The plain-text name is a clearly documented fallback, not
a redesigned logo. Replace the shared widget with the exact approved artwork when
available. Do not change the asset's colors or proportions. Flutter-native launcher
and browser icons remain scaffold placeholders and must be replaced before release.

Splash, welcome, app header and profile all reuse `BrandLockup`. Future login and
marketing surfaces should reuse the same approved asset. Screens explicitly identify
future services; no controls pretend to book, purchase, sign in or generate advice.
