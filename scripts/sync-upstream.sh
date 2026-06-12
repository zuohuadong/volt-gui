#!/usr/bin/env bash
# sync-upstream.sh — Fetch new commits from upstream (main-v2), merge with
# VoltUI branding replacements, and push to a sync branch.
#
# Usage: sync-upstream.sh [BASE_COMMIT]
# If BASE_COMMIT is provided, only sync commits after that commit.
# Otherwise, read the last-synced commit from .upstream-sync-marker.
#
# The upstream repo (esengine/DeepSeek-Reasonix) uses the name "Reasonix";
# this script applies branding replacements so the merged code uses "VoltUI"
# consistently. The .upstream-sync-marker file tracks the last upstream commit
# that was synced, so subsequent runs are incremental.

set -euo pipefail

UPSTREAM_REPO="https://github.com/esengine/DeepSeek-Reasonix.git"
UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="main-v2"
BRANCH_PREFIX="sync/upstream"
MAIN_BRANCH="main"
MARKER_FILE=".upstream-sync-marker"

# Branding replacements: upstream name → VoltUI name (order matters — longest first)
REPLACEMENTS=(
  "DeepSeek-Reasonix:voltui"
  "REASONIX_:VOLTUI_"
  "REASONIX:VOLTUI"
  "Reasonix:VoltUI"
  "reasonix:voltui"
)

# Files/dirs to rename (upstream name → VoltUI name)
FILE_RENAMES=(
  "REASONIX.md:VOLTUI.md"
  "reasonix.example.toml:voltui.example.toml"
  ".reasonix:.voltui"
  "cmd/reasonix:cmd/voltui"
  "cmd/reasonix-plugin-example:cmd/voltui-plugin-example"
  "npm/reasonix:npm/voltui"
  "npm/reasonix/bin/reasonix.js:npm/voltui/bin/voltui.js"
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

# If the remote URL is wrong (e.g. from a previous brand replacement), fix it
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

# Attempt merge
echo "Merging upstream/${UPSTREAM_BRANCH} into $SYNC_BRANCH..."
MERGE_RESULT=0
git merge "upstream/${UPSTREAM_BRANCH}" --no-edit || MERGE_RESULT=$?

if [ $MERGE_RESULT -ne 0 ]; then
  echo "Merge conflicts detected, resolving automatically..."

  # Get list of conflicted files
  CONFLICT_FILES=$(git diff --name-only --diff-filter=U)

  for FILE in $CONFLICT_FILES; do
    echo "Resolving conflicts in: $FILE"
    # Use awk to resolve: keep upstream side (with VoltUI branding applied later)
    awk '
    /^<<<<<<< HEAD$/ { skip="head"; next }
    /^=======$/ && skip=="head" { skip="upstream"; next }
    /^>>>>>>> upstream\/main-v2$/ && skip=="upstream" { skip=""; next }
    skip=="upstream" { print; next }
    skip=="head" { next }
    { print }
    ' "$FILE" > "${FILE}.resolved"

    mv "${FILE}.resolved" "$FILE"
    git add "$FILE"
  done
fi

# Rename files/directories from upstream naming to VoltUI naming
echo "Renaming files/directories to VoltUI branding..."
for PAIR in "${FILE_RENAMES[@]}"; do
  OLD="${PAIR%%:*}"
  NEW="${PAIR##*:}"
  if [ -e "$OLD" ] && [ "$OLD" != "$NEW" ]; then
    echo "  Renaming: $OLD → $NEW"
    mkdir -p "$(dirname "$NEW")"
    mv "$OLD" "$NEW"
  fi
done

# Apply VoltUI branding text replacements
echo "Applying VoltUI branding replacements..."

for PAIR in "${REPLACEMENTS[@]}"; do
  OLD="${PAIR%%:*}"
  NEW="${PAIR##*:}"
  echo "  Replacing: $OLD → $NEW"

  # Find text files containing the old brand name and replace
  find . -type f \
    ! -path './.git/*' \
    ! -path './node_modules/*' \
    ! -path './desktop/frontend/node_modules/*' \
    ! -name 'package-lock.json' \
    ! -name 'pnpm-lock.yaml' \
    ! -name 'go.sum' \
    ! -name '*.ico' \
    ! -name '*.png' \
    ! -name '*.jpg' \
    ! -name '*.gz' \
    ! -name '*.zip' \
    -exec grep -l "$OLD" {} \; 2>/dev/null | while read -r FILE; do
    # Skip binary files
    if file "$FILE" | grep -q "text"; then
      sed -i "s/${OLD}/${NEW}/g" "$FILE"
      git add "$FILE" 2>/dev/null || true
    fi
  done
done

# Also handle ~/.reasonix/ path references → ~/.voltui/
find . -type f \( -name '*.go' -o -name '*.ts' -o -name '*.tsx' -o -name '*.md' -o -name '*.toml' \) \
  ! -path './.git/*' ! -path './node_modules/*' \
  -exec grep -l '~/.reasonix/' {} \; 2>/dev/null | while read -r FILE; do
  sed -i 's|~\/.reasonix/|~/.voltui/|g' "$FILE"
  git add "$FILE" 2>/dev/null || true
done

# Commit the merge if there are uncommitted changes
if ! git diff --cached --quiet 2>/dev/null || ! git diff --quiet 2>/dev/null; then
  git add -A
  HEAD_COMMIT=$(git log --format="%h" -1 "upstream/${UPSTREAM_BRANCH}")
  git commit -m "merge: sync upstream Go rewrite commits (${BASE_COMMIT:0:8}..${HEAD_COMMIT}) with VoltUI branding" || true
fi

# Update marker
echo "$(git rev-parse "upstream/${UPSTREAM_BRANCH}")" > "$MARKER_FILE"
git add "$MARKER_FILE"
git commit -m "chore: update upstream sync marker" || true

# Push
echo "Pushing $SYNC_BRANCH to origin..."
git push origin "$SYNC_BRANCH" --force-with-lease

echo ""
echo "=== Sync complete ==="
echo "Branch: $SYNC_BRANCH"
echo "New commits synced: $COMMIT_COUNT"
echo ""
echo "Next step: Merge $SYNC_BRANCH into $MAIN_BRANCH"
