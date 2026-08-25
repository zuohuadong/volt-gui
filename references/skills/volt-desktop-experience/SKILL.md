---
name: volt-desktop-experience
description: "Use when mapping operational task-lifecycle UX onto the official DeepSeek Harness surface or reviewing whether an Electron change violates the shell-only boundary."
---

# Volt Desktop Experience

The official DSH Web UI owns task lifecycle, conversation, approvals, tools,
workspace interaction, recovery, and persisted user state. This repository owns
only the Electron shell and a supported DSH profile patch.

## Route The Request

1. Read `DESIGN.md` and the project overlay.
2. Identify whether the request is already supported by the official DSH Web UI.
3. Use official profile/plugin extension points for product behavior.
4. Change Electron only for native window, navigation, security, process
   lifecycle, product identity, or packaging.
5. When DSH lacks an extension point, record a dependency requirement instead of
   creating a repository-owned UI or state implementation.

## Evidence Rules

- Verify the real DSH Web process and workflow; static mocks are insufficient.
- Do not infer session, approval, tool, or persistence behavior from Electron
  process state alone.
- Keep Electron navigation on its managed IPv4 loopback origin.
- Do not expose a preload API or parallel permission/storage contract.
- Preserve official DSH ownership of credentials and workspace state.

## Verification

```bash
pnpm test
pnpm run test:dsh-integration
pnpm run build:desktop
node scripts/check-electron-runtime-boundary.mjs
node scripts/check-migration-boundary.mjs
git diff --check
```
