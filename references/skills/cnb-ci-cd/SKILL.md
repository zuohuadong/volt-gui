---
name: cnb-ci-cd
description: Use when configuring or reviewing the CNB validation pipeline for the Node 26, Electron, and official DeepSeek Harness architecture.
---

# CNB CI/CD

## Current Scope

CNB is the source-validation runner and the controlled Windows x64 unsigned-review
release runner. It uses the exact Node and pnpm versions from the repository
contract, installs the frozen lockfile, runs official DSH and Electron tests,
audits production dependencies, and builds the source bundle. Tag releases must
use the repository's atomic draft/upload/verify/publish script; signed releases,
updater publication, macOS/Linux packaging, and external synchronization remain
disabled.

## Required Pipeline

```yaml
main:
  push:
    - docker:
        image: node:26.8.1
      stages:
        - name: install
          script: pnpm install --frozen-lockfile
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
- Keep Release creation draft-only until all assets are uploaded and verified.
- Require Authenticode `NotSigned`, local SHA-256, ZIP integrity, and API asset hash/size verification.
- Do not claim signed or production release status from an unsigned-review artifact.

## Verification

```bash
node --test scripts/ci-workflows.test.mjs
node scripts/check-migration-boundary.mjs
git diff --check
```
