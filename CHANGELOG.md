# Changelog

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
