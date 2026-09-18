---
name: cnb-ci-cd
description: Use when configuring or reviewing the CNB validation pipeline for the Node 26, Electron, and official DeepSeek Harness architecture.
---

# CNB CI/CD

## Current Scope

CNB is a source-validation runner for this GitHub repository. It uses the exact
Node and pnpm versions from the repository contract, installs the frozen
lockfile, runs official DSH and Electron tests, audits production dependencies,
and builds the source bundle.

Windows x64 unsigned-review packaging remains on GitHub's native Windows runner.
OEM model credentials are injected only through GitHub Actions secrets at
release time. CNB must not import tracked `.cnb/envs.yml` keys, vendor
BrowserSkill binaries, create tags, publish releases, sign artifacts, package
other platforms, or synchronize external source trees.

## Required Pipeline

```yaml
main:
  push:
    - docker:
        image: node:26.8.1
      stages:
        - name: install
          script: |
            corepack enable
            corepack prepare pnpm@12.1.0 --activate
            pnpm install --frozen-lockfile
        - name: verify
          script: |
            pnpm run test:dsh-integration
            pnpm test
            node scripts/check-migration-boundary.mjs
            pnpm audit --prod --audit-level high
        - name: build
          script: pnpm run build
```

## Rules

- Pin Node and pnpm to the repository's current approved versions.
- Never print tokens, registry credentials, provider keys, or secret-bearing URLs.
- Keep the lockfile frozen in CI.
- Do not add automatic tag, release, deployment, or external synchronization steps.
- Do not claim Windows packaging from a Linux source-build result.
- Stage BrowserSkill CLI by sha256 at build time; do not commit `vendor/bsk/bsk.exe`.

## Verification

```bash
node --test scripts/ci-workflows.test.mjs
node scripts/check-migration-boundary.mjs
git diff --check
```
