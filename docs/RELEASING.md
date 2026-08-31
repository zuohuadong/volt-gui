# Releasing

## Candidate

Release candidates are immutable commits verified with Node `26.8.1`, pnpm `12.1.0`, the frozen lockfile and the current official DSH package.

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

## CNB tag release

Pushing a semver tag such as `v0.31.2` runs the Windows self-hosted CNB pipeline. The pipeline verifies the candidate, packages the installer and portable ZIP, creates a prerelease named after the tag, and uploads both versioned files as permanent Release attachments.

The pipeline uses CNB's temporary build token and never stores a repository token in source. Releases remain unsigned review builds until signing, updater provenance, and rollback gates are implemented.

## Future release gates

Signing, notarization, updater provenance, public release creation and rollback must be implemented and independently reviewed before the workflow may publish a stable artifact. Do not reintroduce the retired native package or multi-channel release chain.
