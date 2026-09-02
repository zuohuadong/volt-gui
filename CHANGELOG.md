# Changelog

## 0.31.29 - 2026-09-02

### Fixed

- Clear management feedback and error banners on tab transitions to prevent
  cross-page message lingering in workbench (#235).
- Suppress empty assistant ghost message bubbles and prevent sender metadata
  vertical truncation (#234).
- Enforce brand green ring and border focus states across input controls and
  composer (#230).
- Align session error handling and credential state indicators (#233).

## 0.31.28 - 2026-09-02

### Fixed

- Support intranet and local LAN model endpoints (e.g. `xg-gomodel`) without
  enforcing external API keys or displaying false "missing key" banners (#234).
- Prevent transcript and streaming message truncation by preserving accumulated
  delta chunks and relaxing runtime context keyword filters (#234).
- Dismiss stale credential requirement errors immediately upon model selection
  or incoming assistant streaming events (#234).

## 0.31.27 - 2026-09-02

### Fixed

- Correctly recognize invalid or expired API key responses as 401 authentication
  failures instead of missing API key errors (#233).
- Sanitize user credentials by stripping surrounding quotes and whitespace on
  save in workbench and settings.
- Clear pending status and surface turn errors immediately on `turn/end` event
  to prevent session stuck in queued state.
- Align topbar runtime status and session list health state when active session
  encounters an error.

## 0.31.20 - 2026-09-02

### Added

- Added official DSH knowledge-base indexing workflows with guarded concurrent
  indexing and Svelte management surfaces.
- Bundled the audited BrowserSkill DSH plugin and CLI for Computer Use, plus
  OfficeCLI as a default DSH MCP integration.

### Fixed

- Stabilized conversation, project, workspace, multimodal attachment, and
  internal-model workflows across the Svelte desktop interface.
- Improved SMB mapping consistency, offline diagnostics, and configuration
  handling without persisting credentials.
- Added structured rendering for browser and Computer Use tool results and
  refined responsive, localized desktop interaction states.

## 0.31.1 - 2026-08-31

### Fixed

- Resolved CNB issue regressions across session management, model discovery,
  workspace browsing, Agent presets, and responsive management UI.

## 1.0.0 - 2026-08-25

### Changed

- Adopted Node 26, Electron, and the official `@deepseek-ai/dsh` package as the
  only supported runtime architecture.
- Reduced the Electron application to window security, loopback navigation, and
  official DSH child-process lifecycle management.
- Moved sessions, tools, approvals, credentials, workspaces, and persistence to
  the official DSH runtime.
- Replaced repository-owned UI and Harness packages with the official DSH Web
  profile and `profiles/anyong.yml` patch.
- Rebuilt CI, CodeQL, CNB validation, and Windows x64 packaging around the locked
  Node workspace.
- Reduced the Astro site and documentation to current product capabilities and
  supported distribution paths.

### Removed

- Retired runtime implementations, desktop bridges, duplicate renderer assets,
  service Workers, legacy distribution packages, and inactive release flows.
- Automated external source synchronization and publication workflows.

### Security

- Electron now denies new windows, unexpected navigation, browser permission
  checks, and browser permission requests.
- The managed DSH Web process binds to IPv4 loopback on an ephemeral port.
- Official DSH and native dependencies are unpacked for the managed
  Electron-as-Node child process.
