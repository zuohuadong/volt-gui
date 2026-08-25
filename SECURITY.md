# Security

## Supported security boundary

VoltUI is an Electron host for the official DeepSeek Harness web profile. The main process starts DSH on `127.0.0.1` with an ephemeral port and loads only the origin published by that process.

The BrowserWindow uses `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, denied unmanaged windows and origin-checked navigation. The DSH child is stopped during application shutdown. The official runtime owns credentials, sessions, tools and workspace policy.

## Reporting

Do not publish credential, workspace, or exploit details in a public issue. Use the repository's private security reporting channel or contact the maintainers listed in the repository metadata. Include the affected commit, platform, exact reproduction boundary and impact without including secrets.

## Release posture

Windows artifacts are currently unsigned-review artifacts. Signing, notarization, updater provenance and public release publication remain fail-closed until their contracts are separately reviewed.

## Contributor requirements

- Never commit API keys, tokens, cookies, private endpoints or user data.
- Validate all new Electron IPC or navigation behavior against the main-process boundary.
- Run `pnpm audit --prod --audit-level high` after dependency changes.
- Run `node scripts/check-migration-boundary.mjs` before requesting review.
