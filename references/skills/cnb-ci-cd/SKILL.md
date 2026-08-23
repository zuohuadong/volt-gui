---
name: cnb-ci-cd
description: Use when configuring, debugging, or modifying CNB (Cloud Native Build) CI/CD pipelines for VoltUI/西谷智灯暗涌系统. Covers .cnb.yml structure, auto-release conventional commit workflow, merge-request CI checks, cross-repo PR creation, and CNB Release API.
---

# CNB CI/CD Pipeline Configuration

This skill covers the CNB (cnb.cool) CI/CD system used for the 西谷智灯暗涌系统 fork of VoltUI.

## Architecture Overview

| Component | Responsibility | Trigger |
|---|---|---|
| **CNB CI** (`.cnb.yml`) | Electron/DSH tests, source bundle build, candidate version calculation | pushes to `main` |
| **GitHub Actions** (`release-desktop.yml`) | Windows x64 Electron packaging and unsigned artifact upload | manual/reusable workflow |

**Current CNB desktop scope**: CNB Linux Docker runners verify the Electron/DSH/Svelte source bundle only. They do not run `electron-builder --win`, create a desktop tag, or publish a CNB Release because a verified Windows/Wine packaging and signing toolchain is not available there. Windows x64 packaging stays on GitHub's native Windows runner.

## .cnb.yml Structure

### Pipeline 1: Build + Test (every push)
```yaml
main:
  push:
    - docker:
        image: node:26
      stages:
        - name: install
          script: pnpm install --frozen-lockfile
        - name: test
          script: pnpm test
        - name: desktop-bundle
          script: pnpm run build:desktop
```

### Pipeline 2: Auto-release (conventional commits only)

SemVer logic:
- `feat!:` or `fix!:` → major bump (desktop-v{X+1}.0.0)
- `feat:` → minor bump (desktop-v{X}.{Y+1}.0)
- `fix:` → patch bump (desktop-v{X}.{Y}.{Z+1})
- `[skip-release]` → skip entirely

The release-readiness pipeline:
1. Detects conventional commit message
2. Calculates new version from latest `desktop-v*` tag
3. Installs Node 26 and pnpm 11 dependencies from the frozen lockfile
4. Runs Electron boundary, runtime mock, Svelte and DSH tests
5. Applies the candidate version and builds the Electron source bundle
6. Leaves tag creation, Windows installer generation, signing, and publication untouched

### Pipeline 3: Merge-request CI
```yaml
merge-request:
  - docker:
        image: node:26
      stages:
        - name: build-check
          script: pnpm run build:desktop
        - name: test
          script: pnpm test
```

### Pipeline 4: Crontab sync (daily 09:00 CST)

Syncs from upstream `aizhuliren/volt-gui` via `scripts/sync-upstream.sh`, then creates PR via CNB API.

## CNB API Reference

### Create Release
```
POST ${CNB_API_ENDPOINT}/${CNB_REPO_SLUG}/-/releases
Headers: Authorization: Bearer ${CNB_TOKEN}, Content-Type: application/json
Body: { tag_name, name, body, draft, prerelease }
```

### Upload Assets (3-step process)
1. `POST .../asset-upload-url` → get `upload_url` + `verify_url`
2. `PUT upload_url` → upload file binary
3. `POST .../asset-upload-confirmation/{token}/{path}?ttl=0` → confirm

### Create Pull Request (cross-repo)
```
POST https://api.cnb.cool/{upstream-slug}/-/pulls
Body: { title, body, head, base }
```
For cross-repo: push branch to upstream first, then create PR.

## Tag Namespace Convention

| Tag pattern | What it triggers | Example |
|---|---|---|
| `desktop-v*` | GitHub Windows x64 desktop candidate | `desktop-v1.6.0` |
| `v*` | GitHub CLI/npm stable release | `v1.6.0` |

**Never mix namespaces** — desktop releases use `desktop-v*`, CLI releases use `v*`.

## Key Environment Variables

| Variable | Source | Usage |
|---|---|---|
| `CNB_COMMIT_MESSAGE` | CNB CI runtime | Conventional commit detection |
| `CNB_REPO_SLUG` | CNB CI runtime | API calls |
| `CNB_TOKEN` | CNB CI runtime | API authentication |
| `CNB_API_ENDPOINT` | CNB CI runtime | API base URL (default: https://api.cnb.cool) |
| `VOLTUI_BRAND_NAME` | Runtime/build | Electron display branding |
| `VOLTUI_BRAND_SHORT_NAME` | Runtime/build | Compact Electron display branding |

## Common Issues

| Problem | Cause | Fix |
|---|---|---|
| No CNB desktop release or installer | CNB intentionally performs build-only verification | Use `.github/workflows/release-desktop.yml` on a Windows runner |
| Windows packaging requested in CNB | Linux runner lacks the verified production toolchain | Keep fail-closed until Wine/signing/updater contracts are approved |
| macOS/Linux artifacts missing | They are intentionally unsupported | Enable them only after confirming native packaging and signing |
| Cross-repo PR fails: branch not found | Branch not pushed to upstream repo | `git push upstream <branch>` first |
| Build/test stage fails | Node/pnpm or lockfile mismatch | Use Node 26, pnpm 11, and regenerate `pnpm-lock.yaml` |
