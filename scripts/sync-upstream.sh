#!/usr/bin/env bash
# sync-upstream.sh — Fetch new commits from upstream (main-v2), selectively
# merge with VoltUI branding replacements, and push to a sync branch.
#
# Key design decisions:
# 1. Skip React frontend, site, and docs entirely
# 2. For heavily-forked packages (control, agent, cli), skip on conflict
#    instead of blindly accepting upstream --theirs
# 3. Only auto-merge safe packages (sandbox, config/migrate, proc, plugin)
# 4. Global brand replacement: reasonix -> voltui
#
# Usage: sync-upstream.sh [BASE_COMMIT]
# If BASE_COMMIT is provided, only sync commits after that commit.
# Otherwise, read the last-synced commit from .upstream-sync-marker.

set -euo pipefail

UPSTREAM_REPO="https://github.com/esengine/DeepSeek-Reasonix.git"
UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="main-v2"
BRANCH_PREFIX="sync/upstream"
MAIN_BRANCH="main"
MARKER_FILE=".upstream-sync-marker"

# Packages with heavy fork divergence — skip on conflict
DIVERGENT_PKGS=(
  "internal/control/"
  "internal/agent/"
  "internal/cli/"
)

# Branding replacements: upstream name → VoltUI name (order matters — longest first)
REPLACEMENTS=(
  "DeepSeek-Reasonix:voltui"
  "REASONIX_:VOLTUI_"
  "REASONIX:VOLTUI"
  "Reasonix:VoltUI"
  "reasonix:voltui"
)

# Determine base commit
if [ $# -ge 1 ]; then
  BASE_COMMIT="$1"
else
  BASE_COMMIT=$(cat "$MARKER_FILE" 2>/dev/null || echo "")
  if [ -z "$BASE_COMMIT" ]; then
    echo "ERROR: No base commit specified and $MARKER_FILE not found."
    echo "Usage: $0 <base_commit_hash>"
    exit 1
  fi
fi

echo "=== VoltUI Upstream Sync (Go rewrite — main-v2) ==="
echo "Base commit: $BASE_COMMIT"

# Add upstream remote if not present
if ! git remote get-url "$UPSTREAM_REMOTE" &>/dev/null; then
  echo "Adding upstream remote: $UPSTREAM_REPO"
  git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_REPO"
fi

# If the remote URL is wrong, fix it
CURRENT_URL=$(git remote get-url "$UPSTREAM_REMOTE" 2>/dev/null || true)
if [ "$CURRENT_URL" != "$UPSTREAM_REPO" ]; then
  echo "Fixing upstream remote URL: $CURRENT_URL → $UPSTREAM_REPO"
  git remote set-url "$UPSTREAM_REMOTE" "$UPSTREAM_REPO"
fi

# Fetch upstream
echo "Fetching upstream/${UPSTREAM_BRANCH}..."
git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"

# Check for new commits
NEW_COMMITS=$(git log --oneline "${BASE_COMMIT}..upstream/${UPSTREAM_BRANCH}" 2>/dev/null || true)
if [ -z "$NEW_COMMITS" ]; then
  echo "No new commits to sync."
  exit 0
fi

COMMIT_COUNT=$(echo "$NEW_COMMITS" | wc -l)
echo "Found $COMMIT_COUNT new commits:"
echo "$NEW_COMMITS"
echo ""

# Create sync branch
DATE_STAMP=$(date +%Y-%m-%d)
SYNC_BRANCH="${BRANCH_PREFIX}-${DATE_STAMP}"

# Ensure we're on main
git checkout "$MAIN_BRANCH"
git pull origin "$MAIN_BRANCH" --rebase || true

# Check if sync branch already exists
if git show-ref --verify --quiet "refs/heads/${SYNC_BRANCH}"; then
  echo "Branch $SYNC_BRANCH already exists, reusing..."
  git checkout "$SYNC_BRANCH"
else
  git checkout -b "$SYNC_BRANCH"
fi

# Apply each upstream commit selectively, excluding React frontend and site
SKIPPED_FILES=""

COMMITS=$(git log --reverse --format='%H' "${BASE_COMMIT}..upstream/${UPSTREAM_BRANCH}")

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
          sed -i 's|reasonix/|voltui/|g' "$f" 2>/dev/null || true
        fi
        git add "$f" 2>/dev/null || true
      done
    }
done

# Global brand replacement (Go files only to avoid touching lock files)
echo "=== Fixing brand references ==="
find . -name '*.go' -not -path './vendor/*' -exec sed -i 's|reasonix/|voltui/|g' {} + 2>/dev/null || true
find . -name '*.go' -not -path './vendor/*' -exec sed -i 's|reasonix\b|voltui|g' {} + 2>/dev/null || true

# Also handle ~/.reasonix/ path references → ~/.voltui/
find . -type f \( -name '*.go' -o -name '*.ts' -o -name '*.svelte' -o -name '*.md' -o -name '*.toml' \) \
  ! -path './.git/*' ! -path './node_modules/*' \
  -exec grep -l '~/.reasonix/' {} \; 2>/dev/null | while read -r FILE; do
  sed -i 's|~\/.reasonix/|~/.voltui/|g' "$FILE"
  git add "$FILE" 2>/dev/null || true
done

# Update sync marker
echo "$(git rev-parse "upstream/${UPSTREAM_BRANCH}")" > "$MARKER_FILE"

# Commit
git add -A

if [ -n "$SKIPPED_FILES" ]; then
  echo ""
  echo "=== WARNING: The following divergent files were SKIPPED ==="
  for f in $SKIPPED_FILES; do
    echo "  - $f"
  done
  echo "Review upstream changes to these files manually if needed."
fi

HEAD_COMMIT=$(git log --format="%h" -1 "upstream/${UPSTREAM_BRANCH}")
git commit -m "sync: upstream Go backend changes (${BASE_COMMIT:0:8}..${HEAD_COMMIT}) with VoltUI branding

Selective sync: Go backend only, Svelte frontend preserved.
Divergent packages (control, agent, cli) skipped on conflict." || true

# Push
echo "Pushing $SYNC_BRANCH to origin..."
git push origin "$SYNC_BRANCH" --force-with-lease

echo ""
echo "=== Sync complete ==="
echo "Branch: $SYNC_BRANCH"
echo "New commits synced: $COMMIT_COUNT"
