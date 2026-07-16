#!/usr/bin/env bash
# Selectively sync Go backend changes from upstream (esengine/DeepSeek-Reasonix)
# while keeping VoltUI branding and the Svelte frontend.
#
# Key design decisions:
# 1. Fetch over SSH and sync selected Go sources/tests plus reviewed resources
# 2. Explicitly exclude CI, documentation, README files, site, and React frontends
# 3. Exclude Volt-owned subsystems with deep API divergence from automatic sync
# 4. Never patch VoltUI's fork-specific Windows sandbox implementation
# 5. Auto-merge other safe packages (config/migrate, proc, plugin)
# 6. Replace source-level reasonix references only in files changed by this sync
# 7. Roll back this run's selected paths if a patch cannot be reconciled
set -euo pipefail

UPSTREAM_URL="git@github.com:esengine/DeepSeek-Reasonix.git"
UPSTREAM_BRANCH="main-v2"
MARKER_FILE=".upstream-sync-marker"

# Keep the selection intentionally narrow. A new non-Go resource must be
# reviewed and added deliberately instead of being copied through implicitly.
SYNC_PATHS=(
  ':(glob)**/*.go'
  'internal/mcpcatalog/catalog-v1.json'
  'internal/mcpcatalog/catalog-v1.json.minisig'
  ':(exclude,glob).github/**'
  ':(exclude,glob)docs/**'
  ':(exclude,glob)**/README*'
  ':(exclude,glob)site/**'
  ':(exclude,glob)cmd/reasonix-guard/**'
  ':(exclude,glob)desktop/**'
  ':(exclude,glob)internal/acp/**'
  ':(exclude,glob)internal/agent/**'
  ':(exclude,glob)internal/boot/**'
  ':(exclude,glob)internal/bot/**'
  ':(exclude,glob)internal/capability/**'
  ':(exclude,glob)internal/capdiag/**'
  ':(exclude,glob)internal/cli/**'
  ':(exclude,glob)internal/config/**'
  ':(exclude,glob)internal/control/**'
  ':(exclude,glob)internal/doctor/**'
  ':(exclude,glob)internal/event/**'
  ':(exclude,glob)internal/eventwire/**'
  ':(exclude,glob)internal/i18n/**'
  ':(exclude,glob)internal/installsource/**'
  ':(exclude,glob)internal/guardian/**'
  ':(exclude,glob)internal/hook/**'
  ':(exclude,glob)internal/memory/**'
  ':(exclude,glob)internal/planmode/**'
  ':(exclude,glob)internal/plugin/**'
  ':(exclude,glob)internal/pluginpkg/**'
  ':(exclude,glob)internal/provider/**'
  ':(exclude,glob)internal/repair/**'
  ':(exclude,glob)internal/sandbox/**'
  ':(exclude,glob)internal/serve/**'
  ':(exclude,glob)internal/skill/**'
  ':(exclude,glob)internal/tool/**'
  ':(exclude,glob)internal/winsandbox/**'
)

MODULE_PATHS=(
  'go.mod'
  'go.sum'
  'desktop/go.mod'
  'desktop/go.sum'
)

echo "=== Fetching upstream over SSH ==="
if git remote get-url upstream >/dev/null 2>&1; then
  git remote set-url upstream "$UPSTREAM_URL"
else
  git remote add upstream "$UPSTREAM_URL"
fi
git fetch --no-tags upstream "$UPSTREAM_BRANCH"

LAST_SYNC=$(cat "$MARKER_FILE" 2>/dev/null || echo "")
UPSTREAM_HEAD=$(git rev-parse "upstream/$UPSTREAM_BRANCH")

if [ "$LAST_SYNC" = "$UPSTREAM_HEAD" ]; then
  echo "Already up to date (sync marker = $UPSTREAM_HEAD)"
  exit 0
fi

if ! git diff --quiet -- "$MARKER_FILE" "${SYNC_PATHS[@]}" "${MODULE_PATHS[@]}" \
  || ! git diff --cached --quiet -- "$MARKER_FILE" "${SYNC_PATHS[@]}" "${MODULE_PATHS[@]}"; then
  echo "ERROR: sync-selected paths and sync marker must be clean before applying upstream" >&2
  exit 2
fi

echo "=== Syncing cumulative diff $LAST_SYNC..$UPSTREAM_HEAD ==="

SKIPPED_FILES=""
SYNC_BASE=""
SYNC_ACTIVE=0
PATCH_FILE=""

rollback_sync() {
  echo "=== Rolling back incomplete sync ===" >&2
  git restore --source="$SYNC_BASE" --staged --worktree -- "${SYNC_PATHS[@]}" "${MODULE_PATHS[@]}" "$MARKER_FILE"
}

cleanup_sync() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -n "$PATCH_FILE" ]]; then
    rm -f "$PATCH_FILE"
  fi
  if ((SYNC_ACTIVE)) && ((status != 0)); then
    if ! rollback_sync; then
      echo "ERROR: rollback of incomplete sync failed" >&2
      status=1
    fi
  fi
  exit "$status"
}

trap cleanup_sync EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

SYNC_BASE=$(git rev-parse HEAD)
SYNC_ACTIVE=1

PATCH_FILE=$(mktemp)
# Apply one cumulative patch instead of replaying every upstream commit. This
# avoids repeatedly merging the same forked file and guarantees that accepted
# upstream files represent the final upstream snapshot.
MISSING_PATHS=()
while IFS=$'\t' read -r status path _; do
  case "$status" in
    M*|D*|T*)
      if ! git ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
        echo "  SKIP (missing fork path): $path"
        MISSING_PATHS+=(":(exclude,literal)$path")
        SKIPPED_FILES="$SKIPPED_FILES $path"
      fi
      ;;
  esac
done < <(git diff --name-status -M "$LAST_SYNC" "$UPSTREAM_HEAD" -- "${SYNC_PATHS[@]}")

if ((${#MISSING_PATHS[@]})); then
  git diff --binary "$LAST_SYNC" "$UPSTREAM_HEAD" -- "${SYNC_PATHS[@]}" "${MISSING_PATHS[@]}" > "$PATCH_FILE"
else
  git diff --binary "$LAST_SYNC" "$UPSTREAM_HEAD" -- "${SYNC_PATHS[@]}" > "$PATCH_FILE"
fi

if [[ -s "$PATCH_FILE" ]] && ! git apply --check --reverse --whitespace=nowarn "$PATCH_FILE" 2>/dev/null; then
  if ! git apply --3way --whitespace=nowarn "$PATCH_FILE" 2>/dev/null; then
    CONFLICT_FILES=()
    while IFS= read -r f; do
      CONFLICT_FILES+=("$f")
    done < <(git diff --name-only --diff-filter=U 2>/dev/null)
    if ((${#CONFLICT_FILES[@]} == 0)); then
      echo "ERROR: cumulative patch failed without resolvable conflicts" >&2
      exit 1
    fi
    for f in "${CONFLICT_FILES[@]}"; do
      echo "  MERGE (upstream snapshot + branding): $f"
      if git checkout --theirs "$f" 2>/dev/null; then
        [[ ! -f "$f" ]] || perl -0pi -e 's|reasonix/|voltui/|g' "$f"
      else
        git rm -f -- "$f"
        continue
      fi
      git add "$f"
    done
  fi
else
  echo "  SKIP (no new sync-selected changes)"
fi
rm -f "$PATCH_FILE"
PATCH_FILE=""

# Replace branding only in Go files altered by this sync, never across the
# caller's existing worktree. Reuse SYNC_PATHS so protected fork-only files
# (including winsandbox and seatbelt implementations) can never be candidates.
echo "=== Fixing brand references ==="
while IFS= read -r -d '' path; do
  case "$path" in
    *.go)
      [[ -f "$path" ]] || continue
      perl -0pi -e 's|reasonix/|voltui/|g; s|\breasonix\b|voltui|g; s|\bReasonix\b|VoltUI|g; s|\bREASONIX\b|VOLTUI|g' "$path"
      ;;
  esac
done < <(git diff --name-only -z "$SYNC_BASE" -- "${SYNC_PATHS[@]}")

# Reconcile module manifests against the merged VoltUI source tree. This keeps
# fork-only dependencies while adding dependencies required by new upstream
# packages, instead of replacing either manifest wholesale.
go mod tidy
(
  cd desktop
  go mod tidy
)

# Do not advance the marker unless both Go modules compile and pass their tests.
echo "=== Verifying root Go module ==="
go test ./...
echo "=== Verifying desktop Go module ==="
(
  cd desktop
  go test ./...
)

# Update sync marker
echo "$UPSTREAM_HEAD" > "$MARKER_FILE"

echo "=== Staging sync-selected changes ==="
git add -- "${SYNC_PATHS[@]}" "${MODULE_PATHS[@]}" "$MARKER_FILE"
SYNC_ACTIVE=0

if [ -n "$SKIPPED_FILES" ]; then
  echo ""
  echo "=== WARNING: The following missing fork files were SKIPPED ==="
  for f in $SKIPPED_FILES; do
    echo "  - $f"
  done
  echo "Review upstream changes to these files manually if needed."
fi

echo "=== Done. Review with git diff --cached. ==="
