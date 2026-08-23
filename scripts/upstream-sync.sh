#!/usr/bin/env bash
# Selectively sync Go backend changes from esengine/DeepSeek-Reasonix while
# keeping VoltUI branding and the Electron/DSH/Svelte desktop workspace.
#
# Key design decisions:
# 1. Fetch over public HTTPS and sync selected Go sources/tests plus reviewed resources
# 2. Explicitly exclude CI, documentation, README files, site, and React frontends
# 3. Exclude Volt-owned subsystems with deep API divergence from automatic sync
# 4. Never patch VoltUI's fork-specific Windows sandbox implementation
# 5. Auto-merge other safe packages (config/migrate, proc, plugin)
# 6. Replace source-level reasonix references only in files changed by this sync
# 7. Roll back this run's selected paths if a patch cannot be reconciled
set -euo pipefail

UPSTREAM_URL="https://github.com/esengine/DeepSeek-Reasonix.git"
UPSTREAM_REMOTE="reasonix-upstream"
UPSTREAM_BRANCH="main-v2"
MARKER_FILE=".upstream-sync-marker"
PARITY_CHECK="scripts/check-upstream-feature-parity.mjs"

# Keep the selection intentionally narrow. A new non-Go resource must be
# reviewed and added deliberately instead of being copied through implicitly.
SYNC_PATHS=(
  ':(glob)**/*.go'
  'internal/mcpcatalog/catalog-v1.json'
  'internal/mcpcatalog/catalog-v1.json.minisig'
  'internal/shellsafe/testdata/command_effects.json'
  ':(exclude,glob).github/**'
  ':(exclude,glob)docs/**'
  ':(exclude,glob)**/README*'
  ':(exclude,glob)site/**'
  ':(exclude,glob)cmd/reasonix-guard/**'
  ':(exclude,glob)benchmarks/**'
  ':(exclude,glob)cmd/e2ebench/**'
  ':(exclude,glob)desktop/**'
  ':(exclude,glob)internal/acp/**'
  ':(exclude,glob)internal/agent/**'
  ':(exclude,glob)internal/autoresearch/**'
  ':(exclude,glob)internal/boot/**'
  ':(exclude,glob)internal/bot/**'
  ':(exclude,glob)internal/botruntime/**'
  ':(exclude,glob)internal/boundedllm/**'
  ':(exclude,glob)internal/capability/**'
  ':(exclude,glob)internal/capdiag/**'
  ':(exclude,glob)internal/checkpoint/**'
  ':(exclude,glob)internal/cli/**'
  ':(exclude,glob)internal/completion/**'
  ':(exclude,glob)internal/config/**'
  ':(exclude,glob)internal/control/**'
  ':(exclude,glob)internal/doctor/**'
  ':(exclude,glob)internal/event/**'
  ':(exclude,glob)internal/eventwire/**'
  ':(exclude,glob)internal/evidence/**'
  ':(exclude,glob)internal/extension/**'
  ':(exclude,glob)internal/filelock/**'
  ':(exclude,glob)internal/fileutil/**'
  ':(exclude,glob)internal/history/**'
  ':(exclude,glob)internal/historycatalog/**'
  ':(exclude,glob)internal/i18n/**'
  ':(exclude,glob)internal/installsource/**'
  ':(exclude,glob)internal/guardian/**'
  ':(exclude,glob)internal/hook/**'
  ':(exclude,glob)internal/jobs/**'
  ':(exclude,glob)internal/memory/**'
  ':(exclude,glob)internal/notify/**'
  ':(exclude,glob)internal/permission/**'
  ':(exclude,glob)internal/plancontract/**'
  ':(exclude,glob)internal/planmode/**'
  ':(exclude,glob)internal/plugin/**'
  ':(exclude,glob)internal/pluginpkg/**'
  ':(exclude,glob)internal/projectiondb/**'
  ':(exclude,glob)internal/provider/**'
  ':(exclude,glob)internal/recovery/**'
  ':(exclude,glob)internal/repair/**'
  ':(exclude,glob)internal/runtimepolicy/**'
  ':(exclude,glob)internal/sandbox/**'
  ':(exclude,glob)internal/serve/**'
  ':(exclude,glob)internal/sessioncatalog/**'
  ':(exclude,glob)internal/sessioninbox/**'
  ':(exclude,glob)internal/shellsafe/**/*.go'
  ':(exclude,glob)internal/shellrun/**'
  # Volt keeps a configurable tool-output redaction policy that upstream no
  # longer exposes. Sync secret handling only through an explicit review so an
  # upstream snapshot cannot remove APIs still used by the fork's boot path.
  ':(exclude,glob)internal/secrets/**'
  ':(exclude,glob)internal/skill/**'
  ':(exclude,glob)internal/stats/**'
  ':(exclude,glob)internal/store/**'
  ':(exclude,glob)internal/taskcatalog/**'
  ':(exclude,glob)internal/taskcontract/**'
  ':(exclude,glob)internal/taskmonitor/**'
  ':(exclude,glob)internal/telemetry/**'
  ':(exclude,glob)internal/tool/**'
  ':(exclude,glob)internal/trajectory/**'
  ':(exclude,glob)internal/usagecatalog/**'
  ':(exclude,glob)internal/winsandbox/**'
  ':(exclude,glob)internal/workspacelease/**'
  ':(exclude,glob)tools/repolint/**'
  ':(exclude)internal/winsandbox/'
  ':(exclude)internal/sandbox/seatbelt_windows.go'
  ':(exclude)internal/sandbox/seatbelt_windows_test.go'
  ':(exclude)internal/sandbox/seatbelt_other.go'
)

MODULE_PATHS=(
  'go.mod'
  'go.sum'
)

rebrand_go_file() {
  local path="$1"
  node --input-type=module - "$path" <<'NODE'
import fs from 'node:fs';

const path = process.argv[2];
const original = fs.readFileSync(path, 'utf8');
const branded = original
  .replaceAll('reasonix/', 'voltui/')
  .replace(/\breasonix_/g, 'voltui_')
  .replace(/\bReasonix_/g, 'VoltUI_')
  .replace(/\bREASONIX_/g, 'VOLTUI_')
  .replace(/\breasonix\b/g, 'voltui')
  .replace(/\bReasonix\b/g, 'VoltUI')
  .replace(/\bREASONIX\b/g, 'VOLTUI');

if (branded !== original) fs.writeFileSync(path, branded);
NODE
}

fetch_upstream() {
  local attempt
  for attempt in 1 2 3; do
    if git fetch --no-tags "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"; then
      return
    fi
    if ((attempt < 3)); then
      echo "Upstream fetch failed (attempt $attempt/3); retrying..." >&2
      sleep $((attempt * 2))
    fi
  done
  return 1
}

echo "=== Fetching upstream over HTTPS ==="
if git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  git remote set-url "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
else
  git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
fi
FETCHED_HEAD=$(git rev-parse "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" 2>/dev/null || true)
if [[ "${VOLTUI_UPSTREAM_USE_FETCHED_HEAD:-0}" == "1" \
  && -n "${VOLTUI_UPSTREAM_EXPECTED_HEAD:-}" \
  && "$FETCHED_HEAD" == "$VOLTUI_UPSTREAM_EXPECTED_HEAD" ]]; then
  echo "WARNING: using explicitly verified fetched head $FETCHED_HEAD" >&2
else
  if ! fetch_upstream; then
    echo "ERROR: upstream fetch failed; refusing an unverified cached head" >&2
    exit 1
  fi
fi

LAST_SYNC=$(cat "$MARKER_FILE" 2>/dev/null || echo "")
UPSTREAM_HEAD=$(git rev-parse "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")

if [[ -n "$LAST_SYNC" ]] && ! git cat-file -e "$LAST_SYNC^{commit}" 2>/dev/null; then
  echo "ERROR: $MARKER_FILE does not name a fetched commit: $LAST_SYNC" >&2
  exit 2
fi

if [[ -n "$(git ls-files -u)" ]]; then
  echo "ERROR: resolve all existing merge conflicts before running upstream sync" >&2
  exit 2
fi

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

SYNC_BASE=""
SYNC_ACTIVE=0
PATCH_FILE=""
SYNC_CHANGE_PATHS=()

rollback_sync() {
  echo "=== Rolling back incomplete sync ===" >&2
  local path
  local -a changed_paths=()
  local -a rollback_candidates=("${SYNC_CHANGE_PATHS[@]}" "${MODULE_PATHS[@]}" "$MARKER_FILE")
  declare -A seen_paths=()

  while IFS= read -r -d '' path; do
    if [[ -z "${seen_paths[$path]+present}" ]]; then
      seen_paths["$path"]=1
      changed_paths+=("$path")
    fi
  done < <(
    git diff --name-only -z -- "${rollback_candidates[@]}"
    git diff --cached --name-only -z -- "${rollback_candidates[@]}"
  )

  for path in "${changed_paths[@]}"; do
    if git cat-file -e "$SYNC_BASE:$path" 2>/dev/null; then
      git restore --source="$SYNC_BASE" --staged --worktree -- "$path"
    else
      git rm -f --cached --ignore-unmatch -- "$path" >/dev/null
      rm -f -- "$path"
    fi
  done
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
SNAPSHOT_PATHS=()
declare -A SYNC_CHANGE_SET=()
while IFS= read -r -d '' path; do
  SYNC_CHANGE_PATHS+=("$path")
  SYNC_CHANGE_SET["$path"]=1
done < <(git diff --name-only -z --no-renames "$LAST_SYNC" "$UPSTREAM_HEAD" -- "${SYNC_PATHS[@]}")

for path in "${SYNC_CHANGE_PATHS[@]}"; do
  if git cat-file -e "$UPSTREAM_HEAD:$path" 2>/dev/null; then
    if ! git ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
      if [[ -e "$path" || -L "$path" ]]; then
        echo "ERROR: upstream path collides with an untracked or ignored path: $path" >&2
        exit 2
      fi
      echo "  SNAPSHOT (missing fork path): $path"
      MISSING_PATHS+=(":(exclude,literal)$path")
      SNAPSHOT_PATHS+=("$path")
    fi
  elif ! git ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
    MISSING_PATHS+=(":(exclude,literal)$path")
  fi
done

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
      if [[ -z "${SYNC_CHANGE_SET[$f]+present}" ]]; then
        echo "ERROR: refusing to resolve an unexpected conflict outside this upstream patch: $f" >&2
        exit 1
      fi
      echo "  MERGE (upstream snapshot + branding): $f"
      if git checkout --theirs "$f" 2>/dev/null; then
        [[ ! -f "$f" ]] || rebrand_go_file "$f"
      else
        git rm -f -- "$f"
        continue
      fi
      git add "$f"
    done
    if [[ -n "$(git ls-files -u)" ]]; then
      echo "ERROR: upstream patch left unresolved conflicts" >&2
      exit 1
    fi
  fi
else
  echo "  SKIP (no new sync-selected changes)"
fi

if ((${#SNAPSHOT_PATHS[@]})); then
  git checkout "$UPSTREAM_HEAD" -- "${SNAPSHOT_PATHS[@]}"
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
      rebrand_go_file "$path"
      ;;
  esac
done < <(git diff --name-only -z "$SYNC_BASE" -- "${SYNC_PATHS[@]}")

# Reconcile the root Go manifest against the merged VoltUI source tree. The
# desktop runtime is an independent pnpm workspace and is verified separately.
go mod tidy

# Do not advance the marker unless the root Go module compiles and passes tests.
echo "=== Verifying root Go module ==="
go test ./...

# The marker must not advance past excluded upstream capability changes until
# each change has an explicit Volt disposition in the parity manifest.
echo "=== Verifying excluded upstream capability parity ==="
node "$PARITY_CHECK" "$LAST_SYNC" "$UPSTREAM_HEAD"

# Update sync marker
echo "$UPSTREAM_HEAD" > "$MARKER_FILE"

echo "=== Staging sync-selected changes ==="
STAGE_PATHS=()
STAGE_CANDIDATES=("${SYNC_CHANGE_PATHS[@]}" "${MODULE_PATHS[@]}" "$MARKER_FILE")
while IFS= read -r -d '' path; do
  STAGE_PATHS+=("$path")
done < <(git diff --name-only -z "$SYNC_BASE" -- "${STAGE_CANDIDATES[@]}")
if ((${#STAGE_PATHS[@]})); then
  git add -A -- "${STAGE_PATHS[@]}"
fi
SYNC_ACTIVE=0

echo "=== Done. Review with git diff --cached. ==="
