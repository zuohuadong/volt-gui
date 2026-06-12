---
name: mobile-app
description: Use when building or maintaining mobile apps, choosing Expo React Native/Capacitor/Flutter/native profiles, packaging Web/PWA as an app, or defining mobile build and native capability verification.
---

# Mobile App

This skill covers mobile app stack selection and verification. It is not a
license to migrate frameworks. Existing project evidence wins over defaults.

## Pair With

- `stack-profile-selector` for profile selection.
- `typescript` for JS/TS mobile projects.
- UI/framework skills already used by the repository.
- `mpx-development-guides` and `mpx-rn-style-guide` for Mpx RN output.

## Default Selection

- Existing mobile project: keep the detected framework and conventions.
- Greenfield JS/TS iOS/Android app with no heavy native requirements: Expo React Native.
- Existing Web/PWA that needs mobile packaging: Capacitor.
- Flutter: only when explicitly requested, already present, or the team accepts Dart/Flutter.
- Native iOS/Android: only for heavy native capabilities, strong platform divergence,
  or hard performance boundaries.

## Contract Checklist

```yaml
app_profile:
  kind: "mobile-app | miniapp | mpx-app"
  stack: "mobile-existing | mobile-expo-rn | mobile-capacitor-pwa | mobile-flutter | mobile-native | mini-existing | mini-native | mini-taro | mini-uniapp | mpx-app | unknown"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  target_platforms: []
  native_capabilities: []
  migration_scope: "none | small | large | blocked"
  required_skills: []
  verification:
    lint: ""
    typecheck: ""
    build_targets: []
    runtime_or_visual_checks: []
  non_goals:
    - "do not migrate framework unless explicitly requested"
```

## Miniapp and Mpx Boundary

- Do not default a generic miniapp request to Mpx.
- Use `mpx-development-guides` only when the user or project evidence points to Mpx.
- Add `mpx-rn-style-guide` when RN/Mpx2RN/Mpx2DRN output or RN style compatibility is involved.
- If the user says only "miniapp" and no framework evidence exists, ask for native/Taro/uni-app/Mpx/other.

## Verification

Use existing project commands first. Typical checks:

- Expo/React Native: lint, typecheck, tests, `expo-doctor` when available, export or native build smoke when packaging changes.
- Capacitor: web build, PWA manifest/service worker checks when relevant, `cap sync`, target-platform smoke.
- Flutter: `flutter analyze`, `flutter test`, debug or release build for changed platforms.
- Native: platform build/test commands such as Xcode or Gradle tasks.
- Mpx2RN: Mpx target build, RN style compatibility checks, and runtime/visual smoke when possible.

## Block Instead of Defaulting

Block when the user only says "app", when target platforms are unclear, when
heavy native capabilities are required but not specified, when framework
migration is implied, or when Mpx output targets are unknown before editing
`.mpx` files.
