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

Pushing a semver tag such as `v0.31.15` runs the Windows self-hosted CNB pipeline. The pipeline verifies the candidate, packages the installer and portable ZIP, checks Authenticode `NotSigned`, local SHA-256 and ZIP integrity, then runs `scripts/publish-cnb-release.mjs`.

The publish script creates a draft Release, uploads and verifies both assets, reads the Release back to confirm names, sizes and SHA-256 values, and only then changes it to non-draft `latest=true`. After a failure, it deletes only a newly created Release that CNB still confirms is the same draft; an ambiguous or already published state is preserved for verification instead of being deleted. The pipeline uses CNB's temporary build token and never stores a repository token in source. Releases remain unsigned review builds until signing, updater provenance, and rollback gates are implemented.

## Future release gates

Signing, notarization, updater provenance, public release creation and rollback must be implemented and independently reviewed before the workflow may publish a stable artifact. Do not reintroduce the retired native package or multi-channel release chain.
