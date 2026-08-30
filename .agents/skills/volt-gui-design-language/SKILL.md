---
name: volt-gui-design-language
description: Review Volt GUI desktop presentation boundaries. The renderer is a thin Svelte workbench over the official DeepSeek Harness runtime; prevent parallel backend or persistence implementations.
---

# Volt GUI Design Boundary

Volt GUI owns a thin Svelte 5 renderer for the workbench, while official DSH
remains the runtime authority for sessions, tools, permissions, credentials, and
persistence. Electron owns native window behavior and security.

## Decision Order

1. Follow the user's current request and `DESIGN.md`.
2. Decide whether the request belongs to Electron shell behavior, the local presentation layer, or official DSH runtime behavior.
3. For Electron, preserve loopback-only navigation, sandboxing, permission denial, and lifecycle ownership.
4. For product UI, use official DSH RPC/event APIs and svadmin/shadcn-svelte components.
5. If a runtime capability is missing, record an upstream DSH requirement instead of creating a private backend or persistence layer.

## Prohibited Implementations

- No copied DSH Web assets or parallel runtime/persistence implementation.
- Keep the local renderer behind a narrow preload bridge and loopback-only DSH API.
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

For user-visible changes, verify the real DSH loopback APIs and the Electron
window. Confirm that navigation stays on the packaged file origin, API calls stay
on the managed loopback origin, and the official workflow remains usable.
