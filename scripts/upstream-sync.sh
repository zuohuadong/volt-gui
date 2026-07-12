#!/usr/bin/env bash
# Selectively sync Go backend changes from upstream (esengine/DeepSeek-Reasonix)
# while keeping VoltUI branding and the Svelte frontend.
#
# Key design decisions:
# 1. Fetch over HTTPS and sync only Go sources/tests plus Go module manifests
# 2. Explicitly exclude CI, documentation, README files, site, and React frontends
# 3. For heavily-forked packages and entrypoints, skip on conflict
#    instead of blindly accepting upstream --theirs
# 4. Never patch VoltUI's fork-specific Windows sandbox implementation
# 5. Auto-merge other safe packages (config/migrate, proc, plugin)
# 6. Replace source-level reasonix references only in files changed by this sync
# 7. Roll back this run's selected paths if a patch cannot be reconciled
set -euo pipefail

UPSTREAM_URL="https://github.com/esengine/DeepSeek-Reasonix.git"
UPSTREAM_BRANCH="main-v2"
MARKER_FILE=".upstream-sync-marker"

# Keep the selection intentionally narrow. A new non-Go resource must be
# reviewed and added deliberately instead of being copied through implicitly.
SYNC_PATHS=(
  ':(glob)**/*.go'
  'go.mod'
  'go.sum'
  'desktop/go.mod'
  'desktop/go.sum'
  ':(exclude,glob).github/**'
  ':(exclude,glob)docs/**'
  ':(exclude,glob)**/README*'
  ':(exclude,glob)site/**'
  ':(exclude,glob)desktop/frontend/**'
  ':(exclude,glob)desktop/frontend-legacy/**'
  ':(exclude,glob)internal/winsandbox/**'
  ':(exclude)internal/sandbox/seatbelt_windows.go'
  ':(exclude)internal/sandbox/seatbelt_windows_test.go'
  ':(exclude)internal/sandbox/seatbelt_other.go'
)

# Packages with heavy fork divergence — skip on conflict
DIVERGENT_PKGS=(
  "internal/control/"
  "internal/agent/"
  "internal/cli/"
  "internal/sandbox/"
  "desktop/main.go"
)

case "$UPSTREAM_URL" in
  https://*) ;;
  *)
    echo "ERROR: upstream URL must use HTTPS: $UPSTREAM_URL" >&2
    exit 2
    ;;
esac

echo "=== Fetching upstream over HTTPS ==="
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

if ! git diff --quiet -- "$MARKER_FILE" "${SYNC_PATHS[@]}" \
  || ! git diff --cached --quiet -- "$MARKER_FILE" "${SYNC_PATHS[@]}"; then
  echo "ERROR: sync-selected paths and sync marker must be clean before applying upstream" >&2
  exit 2
fi

echo "=== Syncing commits $LAST_SYNC..$UPSTREAM_HEAD ==="

COMMITS=$(git log --reverse --format='%H' "$LAST_SYNC..upstream/$UPSTREAM_BRANCH" 2>/dev/null || git log --reverse --format='%H' "upstream/$UPSTREAM_BRANCH" -20)

SKIPPED_FILES=""
SYNC_BASE=""
SYNC_ACTIVE=0
PATCH_FILE=""

rollback_sync() {
  echo "=== Rolling back incomplete sync ===" >&2
  git restore --source="$SYNC_BASE" --staged --worktree -- "${SYNC_PATHS[@]}" "$MARKER_FILE"
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

for c in $COMMITS; do
  echo "--- Patching $c ---"
  PATCH_FILE=$(mktemp)
  git show --format= --binary "$c" -- "${SYNC_PATHS[@]}" > "$PATCH_FILE"
  if [[ ! -s "$PATCH_FILE" ]]; then
    echo "  SKIP (no sync-selected paths)"
    rm -f "$PATCH_FILE"
    continue
  fi
  if git apply --check --reverse --whitespace=nowarn "$PATCH_FILE" 2>/dev/null; then
    echo "  SKIP (already applied)"
    rm -f "$PATCH_FILE"
    continue
  fi
  if ! git apply --3way --whitespace=nowarn "$PATCH_FILE" 2>/dev/null; then
      rm -f "$PATCH_FILE"
      # Only conflicts in declared divergent packages may be resolved here.
      CONFLICT_FILES=()
      while IFS= read -r f; do
        CONFLICT_FILES+=("$f")
      done < <(git diff --name-only --diff-filter=U 2>/dev/null)
      if ((${#CONFLICT_FILES[@]} == 0)); then
        echo "ERROR: could not apply $c and Git reported no resolvable conflicts" >&2
        exit 1
      fi
      for f in "${CONFLICT_FILES[@]}"; do
        # Check if this file is in a divergent package
        IS_DIVERGENT=false
        for pkg in "${DIVERGENT_PKGS[@]}"; do
          if [[ "$f" == "$pkg"* ]]; then
            IS_DIVERGENT=true
            break
          fi
        done
        if $IS_DIVERGENT; then
          echo "  SKIP (divergent package): $f"
          git checkout --ours "$f"
          SKIPPED_FILES="$SKIPPED_FILES $f"
        else
          # For non-divergent files, accept upstream and fix branding
          echo "  MERGE (theirs + branding): $f"
          git checkout --theirs "$f"
          perl -0pi -e 's|reasonix/|voltui/|g' "$f"
        fi
        git add "$f"
      done
  fi
  rm -f "$PATCH_FILE"
done

# Replace branding only in Go files altered by this sync, never across the
# caller's existing worktree. Reuse SYNC_PATHS so protected fork-only files
# (including winsandbox and seatbelt implementations) can never be candidates.
echo "=== Fixing brand references ==="
while IFS= read -r -d '' path; do
  case "$path" in
    *.go)
      perl -0pi -e 's|reasonix/|voltui/|g; s|\breasonix\b|voltui|g; s|\bReasonix\b|VoltUI|g; s|\bREASONIX\b|VOLTUI|g' "$path"
      ;;
  esac
done < <(git diff --name-only -z "$SYNC_BASE" -- "${SYNC_PATHS[@]}")

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
git add -- "${SYNC_PATHS[@]}" "$MARKER_FILE"
SYNC_ACTIVE=0

if [ -n "$SKIPPED_FILES" ]; then
  echo ""
  echo "=== WARNING: The following divergent files were SKIPPED ==="
  for f in $SKIPPED_FILES; do
    echo "  - $f"
  done
  echo "Review upstream changes to these files manually if needed."
fi

echo "=== Done. Review with git diff --cached. ==="
