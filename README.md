# VoltUI

VoltUI is a local Electron desktop shell for the official DeepSeek Harness (DSH) web profile.

## Runtime contract

- Node.js `26.7.0` (Node 26 type stripping is supported for erasable `.ts` scripts).
- pnpm `11.23.0` with a frozen lockfile.
- Electron `44.0.0` and electron-builder `26.15.3`.
- Official `@deepseek-ai/dsh@0.1.1-rc.2`, pinned exactly in the root and Electron packages.
- Windows x64 is the verified packaging target. Release artifacts are unsigned-review artifacts until signing and updater contracts are approved.

Electron owns the window, navigation policy, process lifecycle and package identity. The official DSH process owns sessions, tools, permissions, credentials, workspace state and storage. The repository does not maintain a second agent engine.

## Quick start

```sh
corepack enable
corepack prepare pnpm@11.23.0 --activate
pnpm install --frozen-lockfile
pnpm run desktop
```

Set `DSH_WORKSPACE` to choose the initial workspace and `DSH_HOME` to choose DSH state storage. Provider credentials stay in the DSH profile/settings boundary; never commit them.

## Verification

```sh
pnpm test
pnpm run test:dsh-integration
pnpm run build
pnpm run dist:desktop
cd site && npm ci && npm test
```

The migration gate rejects tracked legacy modules, retired native package trees, old in-repository Harness packages, former synchronization references and retired renderer paths in active code, CI, scripts and site pages.

## Repository map

- `apps/desktop-electron/`: Electron main process, official DSH child lifecycle and Windows packaging.
- `profiles/`: ordered profile overlays applied to official DSH bundles.
- `scripts/`: launcher, integration tests, runtime boundary checks, migration checks and packaging helpers.
- `site/`: Astro documentation site for the current runtime contract.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
