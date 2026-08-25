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

The workflow records installer and portable executable hashes and requires their Authenticode status to be `NotSigned`. This is an unsigned-review artifact, not a production release.

## Future release gates

Signing, notarization, updater provenance, public release creation and rollback must be implemented and independently reviewed before the workflow may publish a stable artifact. Do not reintroduce the retired native package or multi-channel release chain.
