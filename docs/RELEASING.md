# Releasing

## Candidate

Release candidates are immutable commits verified with Node `26.7.0`, pnpm `11.23.0`, the frozen lockfile and the current official DSH package.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run test:dsh-integration
node scripts/check-migration-boundary.mjs
pnpm run build
```

## Desktop artifact

Windows x64 packaging runs with:

```sh
pnpm run dist:desktop
```

The workflow records hashes for the installer executable and portable ZIP archive, and requires the installer's Authenticode status to be `NotSigned`. The archive is extracted once and runs `Anyong.exe` directly instead of unpacking the complete DSH runtime on every launch. These remain unsigned-review artifacts, not a production release.

## Future release gates

Signing, notarization, updater provenance, public release creation and rollback must be implemented and independently reviewed before the workflow may publish a stable artifact. Do not reintroduce the retired native package or multi-channel release chain.
