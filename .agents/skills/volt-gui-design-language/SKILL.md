---
name: volt-gui-design-language
description: Review Volt GUI desktop presentation boundaries. The current renderer is the official DeepSeek Harness Web UI; use this skill to prevent a local renderer from returning and to route UI changes through supported DSH extensions.
---

# Volt GUI Design Boundary

Volt GUI does not own a desktop renderer. The official DSH Web UI is the product
surface, and Electron owns only native window behavior and security.

## Decision Order

1. Follow the user's current request and `DESIGN.md`.
2. Decide whether the request belongs to Electron shell behavior or official DSH UI.
3. For Electron, preserve loopback-only navigation, sandboxing, permission denial, and lifecycle ownership.
4. For product UI, use a documented DSH profile or plugin extension point.
5. If no supported extension exists, record an upstream DSH requirement instead of creating a local renderer.

## Prohibited Implementations

- No local renderer, preload bridge, static fallback application, or copied DSH Web assets.
- No parallel session, tool, permission, credential, workspace, or persistence layer.
- No mock UI accepted as evidence for a real DSH flow.
- No direct edits inside installed dependencies.

## Verification

```bash
pnpm --filter @voltui/desktop-electron run build
pnpm test
pnpm run test:dsh-integration
node scripts/check-migration-boundary.mjs
git diff --check
```

For user-visible changes, verify both the real DSH Web URL and the Electron
window. Confirm that navigation stays on the managed loopback origin and that
the official workflow remains usable.
