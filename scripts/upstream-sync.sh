#!/usr/bin/env bash
# Selectively sync Go backend changes from upstream (esengine/DeepSeek-Reasonix)
# while keeping VoltUI branding and the Svelte frontend.
set -euo pipefail

UPSTREAM_URL="https://github.com/esengine/DeepSeek-Reasonix.git"
UPSTREAM_BRANCH="main-v2"
MARKER_FILE=".upstream-sync-marker"

echo "=== Fetching upstream ==="
git remote remove upstream 2>/dev/null || true
git remote add upstream "$UPSTREAM_URL"
git fetch upstream "$UPSTREAM_BRANCH"

LAST_SYNC=$(cat "$MARKER_FILE" 2>/dev/null || echo "")
UPSTREAM_HEAD=$(git rev-parse "upstream/$UPSTREAM_BRANCH")

if [ "$LAST_SYNC" = "$UPSTREAM_HEAD" ]; then
  echo "Already up to date (sync marker = $UPSTREAM_HEAD)"
  exit 0
fi

echo "=== Syncing commits $LAST_SYNC..$UPSTREAM_HEAD ==="

# Apply each upstream commit, excluding React frontend and site changes,
# then fix reasonix -> voltui module references.
COMMITS=$(git log --reverse --format='%H' "$LAST_SYNC..upstream/$UPSTREAM_BRANCH" 2>/dev/null || git log --reverse --format='%H' "upstream/$UPSTREAM_BRANCH" -20)

for c in $COMMITS; do
  echo "--- Patching $c ---"
  git show "$c" -- . \
    ':(exclude)desktop/frontend/' \
    ':(exclude)desktop/frontend-legacy/' \
    ':(exclude)site/' \
    ':(exclude)docs/README*' \
    | git apply --3way --whitespace=nowarn - 2>/dev/null || {
      echo "  (patch $c had conflicts, applying theirs for conflict files)"
      # For files that conflicted, accept upstream version and fix branding
      for f in $(git diff --name-only --diff-filter=U 2>/dev/null); do
        git checkout --theirs "$f" 2>/dev/null || true
        sed -i 's|reasonix/|voltui/|g' "$f" 2>/dev/null || true
        git add "$f" 2>/dev/null || true
      done
    }
done

# Global brand replacement
echo "=== Fixing brand references ==="
# Only fix in Go files to avoid touching lock files or non-Go artifacts
find . -name '*.go' -not -path './vendor/*' -exec sed -i 's|reasonix/|voltui/|g' {} + 2>/dev/null || true
find . -name '*.go' -not -path './vendor/*' -exec sed -i 's|reasonix\b|voltui|g' {} + 2>/dev/null || true

# Update sync marker
echo "$UPSTREAM_HEAD" > "$MARKER_FILE"

echo "=== Staging changes ==="
git add -A

echo "=== Done. Review with git diff --cached. ==="
