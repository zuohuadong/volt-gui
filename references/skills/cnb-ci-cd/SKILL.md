---
name: cnb-ci-cd
description: Use when configuring, debugging, or modifying CNB (Cloud Native Build) CI/CD pipelines for VoltUI/暗涌. Covers .cnb.yml structure, auto-release conventional commit workflow, merge-request CI checks, cross-repo PR creation, and CNB Release API.
---

# CNB CI/CD Pipeline Configuration

This skill covers the CNB (cnb.cool) CI/CD system used for the 暗涌 fork of VoltUI.

## Architecture Overview

| Component | Responsibility | Trigger |
|---|---|---|
| **CNB CI** (`.cnb.yml`) | Version calculation + push tag + CNB Release info | `feat:/fix:` commit to main |
| **GitHub Actions** (`release-desktop.yml`) | Desktop build on native runners | `desktop-v*` tag push |
| **GitHub Actions** (`release.yml`) | CLI + npm publish | `v*` tag push |

**Why desktop builds are NOT in CNB CI**: Wails requires CGO + platform-native WebView (macOS Cocoa, Windows WebView2, Linux WebKitGTK). Cannot cross-compile in Docker container.

## .cnb.yml Structure

### Pipeline 1: Build + Test (every push)
```yaml
main:
  push:
    - docker:
        image: golang:1.26
      stages:
        - name: build
          script: make build
        - name: test
          script: go test ./...
```

### Pipeline 2: Auto-release (conventional commits only)

SemVer logic:
- `feat!:` or `fix!:` → major bump (desktop-v{X+1}.0.0)
- `feat:` → minor bump (desktop-v{X}.{Y+1}.0)
- `fix:` → patch bump (desktop-v{X}.{Y}.{Z+1})
- `[skip-release]` → skip entirely

The auto-release pipeline:
1. Detects conventional commit message
2. Calculates new version from latest `desktop-v*` tag
3. Creates and pushes `desktop-v*` tag → triggers GitHub Actions
4. Creates CNB Release with changelog (artifacts come from GitHub Actions)

### Pipeline 3: Merge-request CI
```yaml
merge-request:
  - docker:
      image: golang:1.26
    stages:
      - name: build-check
        script: make build
      - name: test
        script: go test ./...
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
| `desktop-v*` | GitHub Actions `release-desktop.yml` | `desktop-v1.6.0` |
| `v*` | GitHub Actions `release.yml` (CLI/npm) | `v1.6.0` |

**Never mix namespaces** — desktop releases use `desktop-v*`, CLI releases use `v*`.

## Key Environment Variables

| Variable | Source | Usage |
|---|---|---|
| `CNB_COMMIT_MESSAGE` | CNB CI runtime | Conventional commit detection |
| `CNB_REPO_SLUG` | CNB CI runtime | API calls |
| `CNB_TOKEN` | CNB CI runtime | API authentication |
| `CNB_API_ENDPOINT` | CNB CI runtime | API base URL (default: https://api.cnb.cool) |
| `XIGU_BRAND_NAME` | `.cnb.yml` env | Brand name for releases (default: 暗涌) |
| `VOLTUI_BRAND_NAME` | Runtime | Desktop build artifact naming |

## Common Issues

| Problem | Cause | Fix |
|---|---|---|
| Release created but no artifacts | CNB CI only pushes tags; GitHub Actions builds | Wait for GitHub Actions to complete |
| `desktop-v*` tag not triggering GitHub Actions | Tag format mismatch | Ensure `release-desktop.yml` trigger matches |
| Cross-repo PR fails: branch not found | Branch not pushed to upstream repo | `git push upstream <branch>` first |
| Build/test stage fails | Go version mismatch | Update docker image to `golang:1.26` |