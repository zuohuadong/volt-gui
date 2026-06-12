---
name: tauri-desktop
description: Use when building or maintaining Tauri desktop apps, including src-tauri, tauri.conf, commands, permissions/capabilities, Rust-side integration, packaging, signing, or updater flows.
---

# Tauri Desktop

Tauri is the lightweight/security desktop alternative when the user accepts the
Rust/native toolchain and the project benefits from smaller artifacts or tighter
native capability boundaries.

## Pair With

- `stack-profile-selector` when selecting or recording the runtime.
- `typescript` for the frontend.
- Rust/Cargo checks using the project's existing commands.
- Frontend skills such as `svelte-code-writer`, `svelte-core-bestpractices`,
  and `tailwind-v4` when editing the UI.

## Detect

Load this skill when the project or task mentions:

- `src-tauri/`, `tauri.conf.*`, `@tauri-apps/*`, `tauri::command`, `invoke`
- Tauri capabilities, permissions, plugins, updater, signing, bundling, or
  Rust-side native integration

## Contract Checklist

```yaml
desktop_profile:
  runtime: "tauri"
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

- Frontend framework and build output path.
- Rust commands exposed to the frontend.
- Capability/permission files touched.
- Plugin list and native APIs used.
- Packaging, signing, updater, and platform matrix when relevant.

## Secure Defaults

- Keep permissions and capabilities minimal.
- Validate all command inputs at the Rust boundary.
- Avoid broad filesystem, shell, network, or process permissions.
- Treat frontend-to-Rust command calls as an API contract.
- Keep remote content disabled unless the allowlist, CSP, and threat model are explicit.
- Do not store secrets in frontend code or unprotected local files.

## Verification

Use the project's existing commands first. Typical checks:

- Frontend typecheck/build.
- `cargo check` or project-specific Rust checks under `src-tauri`.
- Tauri dev/build smoke for changed commands, permissions, plugins, updater, or packaging.
- Platform-specific packaging checks when target platforms changed.

## Block Instead of Defaulting

Block when the team has not accepted Rust/native tooling, when runtime migration
is implied but not authorized, or when platform targets, capabilities, signing,
updater, app-store distribution, or native security boundaries are unclear.
