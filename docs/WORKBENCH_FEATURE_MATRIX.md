# Desktop Workbench Feature Matrix

This matrix tracks the production Electron/DSH/Svelte 5 workbench. Only the
renderer reached from `apps/desktop-frontend/electron.html` counts as an active
desktop feature; inactive legacy components are not runtime evidence.

Status values:

- `planned`: contract exists, no implementation yet.
- `partial`: implementation exists but has missing flows or weak verification.
- `usable`: user-visible flow works with targeted verification.
- `complete`: the supported scope has regression coverage and packaging evidence.

## Production P0 gate

```sh
./scripts/p0-production-smoke.sh
```

The default gate is deterministic and secret-free. It covers the Electron
preload boundary, active-renderer mock exclusion, Svelte checks, DSH tests,
frontend unit tests, the Electron source bundle, and `git diff --check`.

Credentialed and packaging checks are explicit opt-ins:

```sh
VOLTUI_P0_REAL_PROVIDER=1 DEEPSEEK_API_KEY=... ./scripts/p0-production-smoke.sh
VOLTUI_P0_DESKTOP_PACKAGE=1 ./scripts/p0-production-smoke.sh
```

Windows x64 is the only verified packaging target. The package opt-in fails on
non-Windows hosts instead of pretending that Wine/signing support exists.

| Area | Feature | Status | Evidence |
| --- | --- | --- | --- |
| Runtime | Electron main/preload boot | complete | `pnpm run build:desktop`; main and preload bundles are built from `apps/desktop-electron/src/`. |
| Runtime | DSH local service lifecycle | usable | The main process starts a loopback-only DSH server, retries occupied ports, exposes the resolved URL through preload, and stops/restarts it for configuration or workspace changes. |
| Security | Renderer isolation | complete | `contextIsolation: true`, `nodeIntegration: false`, typed preload methods, navigation blocking, and `scripts/check-electron-runtime-boundary.mjs`. |
| Security | Secret boundary | complete | Public config exposes `apiKeySet` but never the API key; renderer runtime smoke verifies the key is not readable. |
| Renderer | Dedicated Electron entry | complete | `electron.html` loads `electron-main.ts` and `ElectronWorkbench.svelte`; missing preload renders an explicit failure instead of loading Wails/mock UI. |
| Conversation | Submit, stream, tools, cancel | usable | The active workbench sends prompts to DSH, renders text/reasoning/tool events, supports cancel, and reports runtime failures locally. |
| Conversation | History, clear and new session | usable | Runtime refresh hydrates history; destructive clear requires confirmation before starting a new conversation. |
| Workspace | Native folder selection | usable | Typed preload opens the native folder dialog, changes the DSH working directory, and refreshes runtime state. |
| Settings | Model, endpoint and API key | usable | Settings validate public inputs in the main process, keep existing secrets unless explicitly cleared, and restart DSH after save. |
| Window | Minimize, maximize, close and DevTools | usable | Every visible native command routes through typed preload IPC with explicit failure handling. |
| Responsive UI | Desktop and narrow layouts | complete | Runtime screenshots at desktop and 620px widths show no overlap, clipping, or horizontal scroll. |
| Packaging | Windows x64 NSIS and portable | complete | `pnpm run dist:desktop`, `scripts/package-dist.mjs`, and package-shape tests require both executable forms. |
| Publication | Production signing and updater | planned | GitHub uploads an explicitly unsigned-review artifact; signing inputs fail closed and no public Desktop Release is created. |
| Legacy cleanup | Inactive Wails-era source | partial | It is excluded from the Electron entry and runtime gates. Removing the remaining dormant source is a separate cleanup task and must not be presented as active capability. |
