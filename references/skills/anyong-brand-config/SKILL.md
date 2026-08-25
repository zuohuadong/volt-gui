---
name: anyong-brand-config
description: Use when configuring or verifying Anyong product identity in the Electron profile and official DeepSeek Harness profile patch.
---

# 暗涌品牌配置

## Sources Of Truth

- Electron package identity: `apps/desktop-electron/src/electron-profile.ts`
- DSH behavior defaults: `profiles/anyong.yml`
- Installer metadata: `apps/desktop-electron/electron-builder.mjs`
- Artifact naming: `scripts/package-dist.mjs`

`ELECTRON_DESKTOP_PROFILE=anyong` selects the Anyong Electron identity. The
default remains `voltui` for the generic package.

## Rules

- Keep product name, application id, executable name, installer id, and artifact
  slug in one typed Electron profile.
- Use the official DSH profile/plugin mechanism for product behavior.
- Do not add a renderer-side brand store, preload API, environment-variable
  shadow configuration, or direct edits to installed DSH packages.
- Do not put credentials or provider secrets into a profile, builder config, or
  generated artifact name.

## Verification

```bash
node --test scripts/electron-profile.test.mjs scripts/package-dist.test.mjs
ELECTRON_DESKTOP_PROFILE=anyong node apps/desktop-electron/src/electron-profile.ts
pnpm run build:desktop
git diff --check
```
