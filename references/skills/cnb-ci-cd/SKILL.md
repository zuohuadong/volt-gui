---
name: cnb-ci-cd
description: Use when configuring or reviewing the CNB validation pipeline for the Node 26, Electron, and official DeepSeek Harness architecture.
---

# CNB CI/CD

## Current Scope

CNB is a source-validation runner. It uses the exact Node and pnpm versions from
the repository contract, installs the frozen lockfile, runs official DSH and
Electron tests, audits production dependencies, and builds the source bundle.

Windows packaging remains on GitHub's native Windows runner. CNB does not create
tags, publish releases, sign artifacts, package other platforms, or synchronize
external source trees.

## Required Pipeline

```yaml
main:
  push:
    - docker:
        image: node:26.7.0
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
- Do not add automatic tag, release, deployment, or external synchronization steps.
- Do not claim Windows packaging from a Linux source-build result.

## Verification

```bash
node --test scripts/ci-workflows.test.mjs
node scripts/check-migration-boundary.mjs
git diff --check
```
