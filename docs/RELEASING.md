# Releasing

How VoltUI ships, who can ship what, and the Preview-before-Stable flow.

## Branch model: trunk + tags

- **`main-v2`** is the single development line (the v2 / 1.x trunk). Every PR merges here.
- **Production is a tag, not a branch.** A release is a tagged snapshot of `main-v2`:
  `v1.4.0` (CLI), `npm-v1.4.0` (npm), `desktop-v1.4.0` (desktop).
- **`v1`** is the archived 1.0/legacy line — maintenance only.
- **Hotfix** an already-released version by branching from its tag, fixing, and tagging again.

There is no separate "production" or "develop" branch by design. Desktop
Preview provides the fast pre-release buffer instead of a long-lived branch.

## Channels

| Surface | Stable | Pre-release buffer |
|---|---|---|
| Native CLI | GitHub Release `vX.Y.Z` + Homebrew | GitHub prerelease `vX.Y.Z-preview.N` (never Homebrew or GitHub Latest) |
| npm | `latest` (current 1.x stable) | `next` (rc), `canary` (`npm i voltui@canary`) |
| Desktop | Short-lived unsigned Windows x64 Actions artifact | Disabled until signing and updater contracts are reviewed |

Native CLI has Stable and Preview. Electron desktop publication is currently
fail-closed; its workflow produces a review artifact, not a public channel:

- **Preview** is the opt-in Native CLI channel, normally cut every 1–2 days,
  using an immutable protected `vX.Y.Z-preview.N` tag and GitHub prerelease.
- **Stable** publishes the Native CLI GitHub Release and Homebrew cask. The
  aligned `desktop-vX.Y.Z` tag authorizes an unsigned Windows x64 review build
  only; it does not publish a Desktop Release or updater pointer.

Homebrew remains Stable-only because it has no separate prerelease channel.
Electron signing, automatic update, and public Desktop publication remain
unsupported claims until a reviewed replacement workflow lands.

An RC is not a third user-facing channel. If a weekly candidate needs a freeze,
use a surface-specific `vX.Y.Z-rc.N` or `desktop-vX.Y.Z-rc.N` tag as an
internal candidate checkpoint. Neither moves a rolling pointer or Homebrew.
npm retains its separate `next` and `canary` dist-tags.

## Who can release what

| Action | Who | Mechanism |
|---|---|---|
| **Cut Native CLI Preview** | release-tag creator + configured reviewer | create and push a protected `vX.Y.Z-preview.N` tag; a minimal relay dispatches **Release** on protected `main-v2`, which classifies it as Preview, pauses on the `canary` environment, and publishes a GitHub prerelease without touching Homebrew or Latest |
| **Build Desktop review artifact** | maintainer + configured reviewer | dispatch **Release desktop** on protected `main-v2`; the workflow builds unsigned Windows x64 artifacts and never publishes a Desktop Release |
| **Ship stable** | release-tag creators + one configured reviewer | atomically push the three stable tags; a minimal tag relay dispatches **Release stable** on protected `main-v2`, which requests one GitHub `release`-environment approval before every channel publishes |
| **Ship a standalone RC** | release-tag creators + one configured reviewer | push the surface-specific prerelease tag; a minimal relay dispatches the standalone workflow on protected `main-v2`, which requests one `release` approval |

Native CLI Preview remains operationally fast, while desktop artifacts are
review-only and require the configured environment approval. A stable release
pauses once in **Release stable** until a configured reviewer approves the
`release` environment; the desktop publisher then builds an explicitly unsigned
artifact and fails if signing inputs or an Authenticode signature are present.

> Repo settings backing this: Environments → `release` and `canary` have the
> same release owners as required reviewers, and the release-tag ruleset restricts
> `v*`/`npm-v*`/`desktop-v*` creation, update, and deletion. Only the
> orchestrator and standalone RC/recovery paths reference the protected
> environment.

The tag-triggered workflows contain no build or signing steps. They relay only
the immutable candidate tag to the current workflow on protected `main-v2`.
The reusable publishers require that protected control plane, while the
orchestrator resolves the three release tags to one immutable candidate SHA and
uses that SHA only for build and publication checkouts. Recovery follows the
same model for an older tag on `main-v2` history. Every publisher revalidates
its remote release tag immediately before publication. An unprotected branch
cannot claim that it already passed the approval job.

Repository `write` access remains a privileged role because repository-level
Actions secrets are available to workflows on repository branches. Publication
credentials should live behind protected environments or provider-side
OIDC/trusted-publishing policies when strict separation from repository writers
is required. The desktop workflow receives no signing credentials.

## The release loop

1. **Develop** — PRs land on `main-v2` (branch auto-deletes on merge).
2. **Prepare the release notes without creating a release-only PR by default** —
   Actions → **Prepare release notes**. Enter the intended version, the previous
   desktop tag when needed, and the number of an existing release-bound PR when
   one is available. The reusable PR must be open, target `main-v2`, come from a
   branch in this repository, and already include the latest `main-v2`. The
   workflow commits the generated notes onto that branch, so product changes and
   their release copy share one PR and one review surface. The added commit still
   reruns that PR's required checks.

   Leave `target_pr` empty only when there is no suitable PR, the candidate PR
   comes from a fork that the repository token cannot update, or the release copy
   needs independent editorial review. In that fallback, the workflow opens or
   updates the dedicated `release-notes/vX.Y.Z` PR as before.

   The workflow sends only public merged-PR metadata to DeepSeek, creates
   equivalent English and Chinese product notes, validates their structure and
   citations, and includes the rendered draft in the workflow summary. Review
   the catalog diff like product copy. Once merged, the same entry drives
   `/changelog/` and the CLI GitHub Release. Desktop review artifacts may reuse
   the approved version metadata, but no Desktop GitHub Release is created. A
   missing catalog entry still blocks stable publication.
3. **Cut Preview** during the intended release cycle (e.g. heading for `1.4.0`):
   - Native CLI: create and push the next protected Preview tag:
     ```sh
     git tag v1.4.0-preview.1
     git push origin v1.4.0-preview.1
     ```
   - Desktop: no public Preview publication; optionally dispatch **Release desktop** for an unsigned review artifact.
   - CLI: Actions → **Release npm** → `base_version: 1.4.0`
   - Publishes the native CLI as a GitHub prerelease. npm still publishes its
     independent `@canary` channel; Desktop remains unpublished.
4. **Test** — native CLI testers download the immutable GitHub prerelease;
   desktop users opt into Preview in Settings → Updates; npm CLI testers
   install `voltui@canary`.
5. **Fix** on `main-v2` via PRs; re-cut Preview as needed (`preview.N` bumps).
   Re-run **Prepare release notes** after material fixes. Reuse the still-open
   release-bound PR when possible; otherwise the workflow updates the same
   dedicated release-notes branch and PR without publishing anything.
6. **Ship stable** when Preview is clean and the release-notes PR is merged —
   create the three tags locally, then push them atomically:
   ```sh
   git tag v1.4.0
   git tag npm-v1.4.0
   git tag desktop-v1.4.0
   git push --atomic origin v1.4.0 npm-v1.4.0 desktop-v1.4.0
   ```
   The `v1.4.0` tag starts a minimal relay, which dispatches **Release stable**
   on protected `main-v2`. Its preflight requires all three tags to exist on the
   exact current `main-v2` commit, renders the reviewed release notes, and runs
   the cache guard. It then **waits once for a configured reviewer to approve the
   GitHub `release` environment** before invoking all three publishers. The
   approval records the immutable release commit. Before any publisher starts,
    Every publisher checks out that SHA and fails if its remote tag moves
    afterward. The desktop publisher builds Windows x64 NSIS and portable
    artifacts with certificate auto-discovery disabled, verifies both are
    `NotSigned`, and uploads them only as a short-lived Actions artifact.
   A stable `npm-v*` publish moves the `latest` dist-tag automatically (build.mjs)
   and release-npm.yml verifies it landed. **Do not skip the npm tag**: the stable
   preflight fails when the matching `npm-v*` or `desktop-v*` tag is missing or
   points elsewhere. That guard exists because 1.0.0–1.17.5 shipped without
   stable npm tags and `npm update -g` silently downgraded users to 0.53.2 (#5822).
   The CLI and npm jobs run concurrently; the CLI's freshness check may warn while
   npm is still propagating, while release-npm.yml's verify step owns the final
   assertion. The stable orchestrator finishes with a postflight that verifies
   both GitHub Releases contain their required assets and npm `latest` exactly
   matches the approved version; missing artifacts can no longer produce a green
    stable run. Desktop public-release checks remain disabled by design.
7. **Next cycle** — Preview rolls on toward `1.5.0`.

### Release-PR frequency rule

- Do not open a dedicated PR merely because a version is being published.
- Prefer the final same-repository product, fix, or release-infrastructure PR
  that already defines the candidate boundary. Generate the notes into that PR
  before its final review.
- A dedicated release-notes PR is the safe fallback, not the default. Use it
  when no suitable PR exists, the only candidate PR comes from a fork, or the
  release copy needs an independent approval boundary.
- Never bypass protected `main-v2` with a direct catalog commit. Reducing PR
  frequency must not remove release-copy review, catalog validation, cache
  checks, atomic tags, the single `release` environment approval, or public
  artifact postflight.
- Release infrastructure and release-note schema changes still require their
  own focused PR. This rule only avoids redundant version-only PRs.

## Notes

- Native CLI Preview uses the protected tag's explicit `N`; npm prerelease
  suffixes may use their workflow `run_number`. Desktop Preview publication is
  disabled until the Electron signing and updater contracts are complete.
- A stable `-rc` tag (e.g. `npm-v1.4.0-rc.1`) still ships under `next`, not `canary`.
- Recover an interrupted stable release by dispatching **Release stable** from
  protected `main-v2` with the existing `vX.Y.Z` tag. Recovery requires the CLI,
  npm, and Desktop tags to remain aligned on an ancestor of current `main-v2`,
  then uses the same single approval and postflight. Never move or recreate the
  published tags to pick up a workflow fix.
- The Electron desktop workflow currently builds Windows x64 NSIS and portable
  executables on `windows-latest`, verifies their shape and checksums, and uploads
  them as a short-lived artifact whose name ends in `-unsigned`.
- Electron production signing and updater publication are fail-closed. Setting
  either signing preflight input makes the workflow fail explicitly. The
  workflow must not create a GitHub Desktop Release, update pointer, or public
  `latest.json` until a reviewed signing and updater design replaces this rule.
- CNB Linux runners validate the source bundle only. They must not run
  `electron-builder --win` or claim that a Windows installer was produced.
- DeepSeek is an editorial drafting dependency, not a runtime or publishing dependency.
  The API key is available only to the manually dispatched preparation workflow; tag
  workflows publish the reviewed JSON already committed to `main-v2` and never call a model.
- Windows x64 is the only verified desktop target. macOS, Linux, automatic
  update, code signing, and notarization remain unsupported release claims.
