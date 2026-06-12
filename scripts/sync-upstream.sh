#!/usr/bin/env bash
# sync-upstream.sh — Fetch new commits from upstream volt-gui, merge directly.
#
# Usage: sync-upstream.sh [BASE_COMMIT]
# If BASE_COMMIT is provided, only sync commits after that commit.
# Otherwise, read the last-synced commit from .upstream-sync-marker.
#
# 上游已经是 VoltUI 品牌 (cnb.cool/aizhuliren/volt-gui)，无需品牌替换。
# 暗涌的品牌定制通过 VOLTUI_BRAND_NAME 环境变量和 .cnb.yml 实现，不改源码。

set -euo pipefail

UPSTREAM_REPO="https://cnb.cool/aizhuliren/volt-gui.git"
UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="main"
BRANCH_PREFIX="sync/upstream"
MAIN_BRANCH="main"
MARKER_FILE=".upstream-sync-marker"

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

echo "=== 暗涌 Upstream Sync (VoltUI Go rewrite) ==="
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
    # Keep upstream side (our fork should follow upstream as closely as possible)
    awk '
    /^<<<<<<< HEAD$/ { skip="head"; next }
    /^=======$/ && skip=="head" { skip="upstream"; next }
    /^>>>>>>> upstream\/main$/ && skip=="upstream" { skip=""; next }
    skip=="upstream" { print; next }
    skip=="head" { next }
    { print }
    ' "$FILE" > "${FILE}.resolved"

    mv "${FILE}.resolved" "$FILE"
    git add "$FILE"
  done
fi

# Commit the merge if there are uncommitted changes
if ! git diff --cached --quiet 2>/dev/null || ! git diff --quiet 2>/dev/null; then
  git add -A
  HEAD_COMMIT=$(git log --format="%h" -1 "upstream/${UPSTREAM_BRANCH}")
  git commit -m "sync: 上游 volt-gui 更新 (${BASE_COMMIT:0:8}..${HEAD_COMMIT})" || true
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