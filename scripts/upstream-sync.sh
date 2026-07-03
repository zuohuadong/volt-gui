#!/usr/bin/env bash
# Selectively sync Go backend changes from upstream (esengine/DeepSeek-Reasonix)
# while keeping VoltUI branding and the Svelte frontend.
#
# Key design decisions:
# 1. Skip React frontend, site, and docs entirely
# 2. For heavily-forked packages (control, agent, cli), skip on conflict
#    instead of blindly accepting upstream --theirs
# 3. Only auto-merge safe packages (sandbox, config/migrate, proc, plugin)
# 4. Global brand replacement: reasonix -> voltui
set -euo pipefail

UPSTREAM_URL="git@github.com:esengine/DeepSeek-Reasonix.git"
UPSTREAM_BRANCH="main-v2"
MARKER_FILE=".upstream-sync-marker"

# Packages with heavy fork divergence — skip on conflict
DIVERGENT_PKGS=(
  "internal/control/"
  "internal/agent/"
  "internal/cli/"
)

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

COMMITS=$(git log --reverse --format='%H' "$LAST_SYNC..upstream/$UPSTREAM_BRANCH" 2>/dev/null || git log --reverse --format='%H' "upstream/$UPSTREAM_BRANCH" -20)

SKIPPED_FILES=""

for c in $COMMITS; do
  echo "--- Patching $c ---"
  git show "$c" -- . \
    ':(exclude)desktop/frontend/' \
    ':(exclude)desktop/frontend-legacy/' \
    ':(exclude)site/' \
    ':(exclude)docs/README*' \
    | git apply --3way --whitespace=nowarn - 2>/dev/null || {
      # Check which files conflicted
      for f in $(git diff --name-only --diff-filter=U 2>/dev/null); do
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
          git checkout --ours "$f" 2>/dev/null || true
          SKIPPED_FILES="$SKIPPED_FILES $f"
        else
          # For non-divergent files, accept upstream and fix branding
          echo "  MERGE (theirs + branding): $f"
          git checkout --theirs "$f" 2>/dev/null || true
          perl -0pi -e 's|reasonix/|voltui/|g' "$f" 2>/dev/null || true
        fi
        git add "$f" 2>/dev/null || true
      done
    }
done

# Global brand replacement (Go files only)
echo "=== Fixing brand references ==="
find . -name '*.go' -not -path './vendor/*' -exec perl -0pi -e 's|reasonix/|voltui/|g; s|\breasonix\b|voltui|g' {} + 2>/dev/null || true

# Update sync marker
echo "$UPSTREAM_HEAD" > "$MARKER_FILE"

echo "=== Staging changes ==="
git add -A

if [ -n "$SKIPPED_FILES" ]; then
  echo ""
  echo "=== WARNING: The following divergent files were SKIPPED ==="
  for f in $SKIPPED_FILES; do
    echo "  - $f"
  done
  echo "Review upstream changes to these files manually if needed."
fi

echo "=== Done. Review with git diff --cached. ==="
