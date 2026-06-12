---
name: electron-desktop
description: Use when building or maintaining Electron desktop apps, including BrowserWindow, preload scripts, IPC, packaging, auto-update, signing/notarization, or Electron security reviews.
---

# Electron Desktop

Electron is the mature default for greenfield desktop applications when the user
needs a production-ready desktop runtime and has not specified a different stack.

## Pair With

- `stack-profile-selector` when selecting or recording the runtime.
- `typescript` for TypeScript Electron projects.
- Frontend skills such as `svelte-code-writer`, `svelte-core-bestpractices`,
  and `tailwind-v4` when editing the renderer.

## Detect

Load this skill when the project or task mentions:

- `electron`, `BrowserWindow`, `ipcMain`, `ipcRenderer`, `contextBridge`, `preload`
- `electron-builder`, `electron-forge`, `electron-vite`, `electron-updater`
- app signing, notarization, installers, auto-update, tray, global shortcuts,
  deep links, native menus, file dialogs, notifications, or multi-window behavior

## Contract Checklist

```yaml
desktop_profile:
  runtime: "electron"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  target_platforms: []
  distribution: "local | installer | app-store | enterprise | unknown"
  native_capabilities: []
  verification:
    typecheck: ""
    build_targets: []
    runtime_smoke: ""
    package_check: ""
```

Also record:

- Main process entrypoint.
- Renderer entrypoint and framework.
- Preload API surface.
- IPC/RPC request/response schema.
- Navigation and remote-content policy.
- Packaging, signing, notarization, and auto-update plan when relevant.

## Secure Defaults

- Keep `contextIsolation: true`.
- Keep `nodeIntegration: false` for renderer windows.
- Prefer `sandbox: true` unless a project-specific reason is documented.
- Expose a minimal, typed API via `contextBridge` in preload.
- Validate every IPC payload at the main-process boundary.
- Use navigation allowlists and block unexpected `window.open` targets.
- Do not load remote content unless the threat model, CSP, and allowlist are explicit.
- Store secrets in OS or backend secret storage, not renderer code.

## Verification

Use the project's existing commands first. Typical checks:

- Typecheck main, preload, and renderer code.
- Build renderer assets.
- Run Electron package/build command when packaging changed.
- Launch a local runtime smoke for changed windows, IPC paths, tray/menu actions,
  updater flow, or file dialogs.
- For UI changes, capture browser or runtime screenshots where practical.

## Block Instead of Defaulting

Block when the task requires runtime migration, platform targets, signing,
notarization, app-store distribution, auto-update, remote WebView content,
native SDK access, or IPC security choices that are not specified.
