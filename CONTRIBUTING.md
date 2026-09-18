# Contributing

VoltUI accepts changes for the Electron shell, official DSH profile overlay, verification scripts and documentation site.

## Development

Use Node `26.8.1` with pnpm `12.1.0`:

```sh
corepack enable
corepack prepare pnpm@12.1.0 --activate
pnpm install --frozen-lockfile
```

The root package and `apps/desktop-electron` package intentionally pin the official DSH version. Upgrade it only after checking the npm `latest` tag, refreshing the lockfile and updating `scripts/dsh-integration.test.mjs`.

## Boundaries

- Keep Electron security defaults: context isolation, disabled Node integration, sandboxing, denied popups and loopback origin checks.
- Do not add a second runtime, local Harness fork, native package line or upstream synchronization job.
- Keep secrets out of source, tests, logs and durable artifacts.
- Do not claim production signing, notarization, updater or release publication without independent evidence.

## Checks

```sh
pnpm test
pnpm run test:dsh-integration
node scripts/check-migration-boundary.mjs
pnpm run build
cd site && npm ci && npm test
git diff --check
```

Behavior changes require focused tests and a current diff review. Package changes also require a Windows x64 packaging check.
