#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/voltui-release-workflow-test.XXXXXX")"
cleanup() {
	case "$test_root" in
	*/voltui-release-workflow-test.*) rm -rf -- "$test_root" ;;
	*) echo "refusing to clean unexpected test directory: $test_root" >&2 ;;
	esac
}
trap cleanup EXIT

stable_workflow="$repo_root/.github/workflows/release-stable.yml"
cli_workflow="$repo_root/.github/workflows/release.yml"
npm_workflow="$repo_root/.github/workflows/release-npm.yml"
desktop_workflow="$repo_root/.github/workflows/release-desktop.yml"

require_pattern() {
	local pattern="$1"
	local path="$2"
	grep -Eq "$pattern" "$path"
}

# Stable publication has one protected approval and one control-plane relay.
[ "$(grep -Ec '^    environment: release$' "$stable_workflow")" = "1" ]
stable_trigger="$repo_root/.github/workflows/release-stable-trigger.yml"
require_pattern 'actions: write' "$stable_trigger"
require_pattern "CONTROL_PLANE_REF.*default_branch" "$stable_trigger"
require_pattern "CONTROL_PLANE_REF !== 'main-v2'" "$stable_trigger"
require_pattern 'createWorkflowDispatch' "$stable_trigger"
require_pattern "workflow_id: 'release-stable\.yml'" "$stable_trigger"
require_pattern "allow_recovery: 'false'" "$stable_trigger"
for retired_workflow in release-preview.yml release-cli-trigger.yml release-desktop-trigger.yml; do
	test ! -e "$repo_root/.github/workflows/$retired_workflow"
done
for production_workflow in "$stable_workflow" "$cli_workflow" "$npm_workflow" "$desktop_workflow"; do
	if sed -n '/^on:/,/^permissions:/p' "$production_workflow" | grep -Eq '^  push:$'; then
		echo "production workflow must run from protected main-v2, not a tag-controlled workflow" >&2
		exit 1
	fi
done

# Every reusable publisher must bind itself to the approved orchestrator, SHA,
# tag, and cache guard before it can receive release credentials.
for publisher in "$cli_workflow" "$npm_workflow" "$desktop_workflow"; do
	require_pattern '^  workflow_call:$' "$publisher"
	require_pattern 'github\.workflow_ref' "$publisher"
	require_pattern 'github\.ref_protected' "$publisher"
	require_pattern 'inputs\.approved_sha' "$publisher"
	require_pattern 'verify-release-tag\.sh' "$publisher"
	require_pattern 'release-stable\.yml' "$publisher"
	require_pattern "needs\.cache-guard\.result == 'success'" "$publisher"
done

# CLI keeps the real Stable/Preview product contract. Preview remains tied to
# protected main-v2 while Stable can only publish its approved immutable tag.
require_pattern 'options: \[stable, preview\]' "$cli_workflow"
sed -n '/^      channel:/,/^      tag:/p' "$cli_workflow" | require_pattern 'default: stable' /dev/stdin
require_pattern "channel == 'preview'.*'canary'.*'release'" "$cli_workflow"
require_pattern 'bash scripts/resolve-cli-release\.sh' "$cli_workflow"
require_pattern 'git merge-base --is-ancestor.*origin/main-v2' "$cli_workflow"
require_pattern 'CLI Preview must tag current main-v2' "$cli_workflow"

# Standalone npm recovery is Stable-only and resolves the full sibling-tag set
# before approval. Every npm path replaces credential-bearing scripts from the
# protected control plane before publishing an immutable candidate.
sed -n '/^  workflow_dispatch:/,/^  workflow_call:/p' "$npm_workflow" | require_pattern 'default: stable' /dev/stdin
if sed -n '/^  workflow_dispatch:/,/^  workflow_call:/p' "$npm_workflow" | grep -Eqi 'preview|canary'; then
	echo "standalone npm dispatch must not expose Preview or Canary" >&2
	exit 1
fi
require_pattern '^  standalone-candidate:$' "$npm_workflow"
require_pattern 'standalone npm recovery must run from protected main-v2' "$npm_workflow"
require_pattern 'RELEASE_TAG="v\$\{BASE_VERSION\}" bash scripts/resolve-stable-release\.sh' "$npm_workflow"
require_pattern '^    environment: release$' "$npm_workflow"
require_pattern 'ref: \$\{\{ needs\.cache-guard\.outputs\.candidate_sha \}\}' "$npm_workflow"
require_pattern 'name: Load protected npm publisher control plane' "$npm_workflow"
for trusted_script in npm/build.mjs npm/publish.mjs scripts/resolve-npm-release.sh scripts/verify-release-tag.sh; do
	grep -Fq "$trusted_script" "$npm_workflow"
done
require_pattern 'Publish or recover immutable npm packages' "$npm_workflow"
require_pattern 'publishPackages' "$repo_root/npm/build.mjs"
require_pattern '[A-Za-z]+CandidateSha: candidateSha' "$repo_root/npm/build.mjs"

# Desktop's public dispatch is Stable-only. The workflow resolves one candidate
# SHA, uses protected release-control verification, and retains SignPath gates.
require_pattern 'options: \[stable\]' "$desktop_workflow"
if sed -n '/^  workflow_dispatch:/,/^  workflow_call:/p' "$desktop_workflow" | grep -Eqi 'preview|canary'; then
	echo "standalone Desktop dispatch must not expose Preview or Canary" >&2
	exit 1
fi
require_pattern '^  resolve:$' "$desktop_workflow"
require_pattern 'sha:.*steps\.candidate\.outputs\.sha' "$desktop_workflow"
require_pattern 'bash scripts/resolve-desktop-candidate\.sh' "$desktop_workflow"
require_pattern 'ref: \$\{\{ needs\.resolve\.outputs\.sha \}\}' "$desktop_workflow"
require_pattern 'path: release-control' "$desktop_workflow"
require_pattern 'ref: \$\{\{ github\.workflow_sha \}\}' "$desktop_workflow"
require_pattern 'signing-policy-slug: release-signing' "$desktop_workflow"
if require_pattern 'signing-policy-slug:.*test-signing' "$desktop_workflow"; then
	echo "public Desktop workflow must not use the SignPath test certificate" >&2
	exit 1
fi
require_pattern '^  signing-contract:$' "$desktop_workflow"
require_pattern '^  attest-signing-contract:$' "$desktop_workflow"
require_pattern 'steps\.submit-windows-payload\.outputs\.signing-request-id' "$desktop_workflow"
require_pattern 'steps\.submit-windows-installer\.outputs\.signing-request-id' "$desktop_workflow"
require_pattern 'artifact-configuration-slug: windows-payload' "$desktop_workflow"
require_pattern 'artifact-configuration-slug: windows-installer-v2' "$desktop_workflow"
grep -Fq -- '-RequireTrusted:$true' "$desktop_workflow"

# The stable orchestrator must call every publisher, perform SignPath preflight,
# carry one reviewed-notes artifact, and verify public artifacts afterwards.
for publisher_job in cli npm desktop; do
	require_pattern "^  ${publisher_job}:$" "$stable_workflow"
	require_pattern "inputs\.publish_${publisher_job}" "$stable_workflow"
done
require_pattern '^  signpath-preflight:$' "$stable_workflow"
require_pattern 'signing_preflight: true' "$stable_workflow"
require_pattern 'signing_preflight_verified: true' "$stable_workflow"
require_pattern '^  postflight:$' "$stable_workflow"
require_pattern 'verify-stable-release-artifacts\.sh' "$stable_workflow"
require_pattern 'name: orchestrator-reviewed-release-notes' "$stable_workflow"
for notes_consumer in "$cli_workflow" "$desktop_workflow"; do
	require_pattern 'name: Download orchestrator-reviewed release notes' "$notes_consumer"
	require_pattern 'name: orchestrator-reviewed-release-notes' "$notes_consumer"
done

go run ./cmd/signpath-contract validate
contract_fingerprint="$(go run ./cmd/signpath-contract fingerprint)"
require_pattern '^v1:[0-9a-f]{64}$' <(printf '%s\n' "$contract_fingerprint")

# Exercise tag resolution and authorization against a real temporary Git remote.
git init --bare -q "$test_root/remote.git"
git clone -q "$test_root/remote.git" "$test_root/repo"
(
	cd "$test_root/repo"
	git config user.name "Release Workflow Test"
	git config user.email "release-workflow-test@example.invalid"
	git commit --allow-empty -q -m "candidate"
	git branch -M main-v2
	git push -q -u origin main-v2

	git tag v1.2.3
	git tag npm-v1.2.3
	git tag -a desktop-v1.2.3 -m "desktop release"
	git push -q origin v1.2.3 npm-v1.2.3 desktop-v1.2.3
	GITHUB_OUTPUT="$test_root/stable.out" RELEASE_TAG=v1.2.3 \
		"$repo_root/scripts/resolve-stable-release.sh"
	grep -Eq '^version=1\.2\.3$' "$test_root/stable.out"
	approved_sha="$(git rev-parse HEAD)"
	grep -Eq '^sha='"$approved_sha"'$' "$test_root/stable.out"

	ACTUAL_CALLER_WORKFLOW_REF='example/volt-gui/.github/workflows/release-stable.yml@refs/tags/v1.2.3' \
		EXPECTED_CALLER_WORKFLOW_REF='example/volt-gui/.github/workflows/release-stable.yml@refs/tags/v1.2.3' \
		CALLER_EVENT_NAME=push CALLER_REF=refs/tags/v1.2.3 CALLER_REF_PROTECTED=true \
		CALLER_WORKFLOW_SHA="$approved_sha" CALLER_SHA="$approved_sha" \
		APPROVED_CLI_TAG=v1.2.3 APPROVED_SHA="$approved_sha" \
		"$repo_root/scripts/verify-release-authorization.sh"
	RELEASE_TAG=desktop-v1.2.3 APPROVED_SHA="$approved_sha" \
		"$repo_root/scripts/verify-release-tag.sh"

	git tag v1.2.4
	git tag npm-v1.2.4
	git push -q origin v1.2.4 npm-v1.2.4
	if ALLOW_STABLE_RECOVERY=true RELEASE_TAG=v1.2.4 \
		"$repo_root/scripts/resolve-stable-release.sh" >"$test_root/missing.log" 2>&1; then
		echo "missing sibling tag unexpectedly passed" >&2
		exit 1
	fi
	grep -Eq 'required stable release tag is missing: desktop-v1\.2\.4' "$test_root/missing.log"

	other_sha="$(git commit-tree HEAD^{tree} -p HEAD -m "other")"
	git tag v1.2.5
	git tag npm-v1.2.5 "$other_sha"
	git tag desktop-v1.2.5
	git push -q origin v1.2.5 npm-v1.2.5 desktop-v1.2.5
	if ALLOW_STABLE_RECOVERY=true RELEASE_TAG=v1.2.5 \
		"$repo_root/scripts/resolve-stable-release.sh" >"$test_root/mismatch.log" 2>&1; then
		echo "mismatched sibling tags unexpectedly passed" >&2
		exit 1
	fi
	grep -Eq 'npm-v1\.2\.5 points to .* expected' "$test_root/mismatch.log"

	git tag -f desktop-v1.2.3 "$other_sha" >/dev/null
	git push -q -f origin desktop-v1.2.3
	git checkout -q --detach "$approved_sha"
	if RELEASE_TAG=desktop-v1.2.3 APPROVED_SHA="$approved_sha" \
		"$repo_root/scripts/verify-release-tag.sh" >"$test_root/moved-tag.log" 2>&1; then
		echo "moved release tag unexpectedly passed approved SHA validation" >&2
		exit 1
	fi
	grep -Eq 'moved to .* after approval' "$test_root/moved-tag.log"
)

# Keep the product's public channel semantics executable, not just text-matched.
EVENT_NAME=workflow_call IN_ORCHESTRATED=true IN_CHANNEL=preview \
	IN_TAG=v1.3.0-preview.42 REF_NAME=main-v2 \
	GITHUB_OUTPUT="$test_root/cli-preview.out" bash "$repo_root/scripts/resolve-cli-release.sh"
grep -Eq '^channel=preview$' "$test_root/cli-preview.out"
grep -Eq '^prerelease=true$' "$test_root/cli-preview.out"

if EVENT_NAME=workflow_dispatch IN_ORCHESTRATED=false IN_CHANNEL=preview \
	IN_TAG=v1.3.0-preview.42 REF_NAME=topic CALLER_REF=refs/heads/topic \
	CALLER_REF_PROTECTED=false GITHUB_OUTPUT="$test_root/cli-unprotected.out" \
	bash "$repo_root/scripts/resolve-cli-release.sh" >"$test_root/cli-unprotected.log" 2>&1; then
	echo "unprotected CLI Preview dispatch unexpectedly passed" >&2
	exit 1
fi
grep -Eq 'manual CLI releases must run from protected main-v2' "$test_root/cli-unprotected.log"

EVENT_NAME=push IN_CHANNEL=stable IN_TAG=desktop-v1.2.3 REF_NAME=v1.2.3 RUN_NUMBER=10 \
	GITHUB_OUTPUT="$test_root/desktop-stable.out" bash "$repo_root/scripts/resolve-desktop-release.sh"
grep -Eq '^tag=desktop-v1\.2\.3$' "$test_root/desktop-stable.out"
grep -Eq '^version=v1\.2\.3$' "$test_root/desktop-stable.out"

if EVENT_NAME=workflow_dispatch IN_CHANNEL=stable IN_TAG='' REF_NAME=main-v2 RUN_NUMBER=50 \
	GITHUB_OUTPUT="$test_root/desktop-missing-tag.out" bash "$repo_root/scripts/resolve-desktop-release.sh" \
	>"$test_root/desktop-missing-tag.log" 2>&1; then
	echo "tag-less Desktop Stable dispatch unexpectedly passed" >&2
	exit 1
fi
grep -Eq 'stable dispatch requires tag' "$test_root/desktop-missing-tag.log"

EVENT_NAME=workflow_call IN_ORCHESTRATED=true IN_CHANNEL=stable IN_BASE_VERSION=1.5.0 \
	IN_TAG=npm-v1.5.0 REF_NAME=v1.5.0 RUN_NUMBER=51 GITHUB_OUTPUT="$test_root/npm-stable.out" \
	bash "$repo_root/scripts/resolve-npm-release.sh"
grep -Eq '^arg=v1\.5\.0$' "$test_root/npm-stable.out"

if EVENT_NAME=workflow_dispatch IN_ORCHESTRATED=false IN_CHANNEL=stable IN_BASE_VERSION=1.5.0 \
	IN_TAG=npm-v1.5.1 REF_NAME=main-v2 RUN_NUMBER=52 GITHUB_OUTPUT="$test_root/npm-mismatch.out" \
	bash "$repo_root/scripts/resolve-npm-release.sh" >"$test_root/npm-mismatch.log" 2>&1; then
	echo "mismatched npm Stable dispatch unexpectedly passed" >&2
	exit 1
fi
grep -Eq 'does not match requested version' "$test_root/npm-mismatch.log"

node --test "$repo_root/npm/publish.test.mjs"
bash "$repo_root/scripts/release-stable.test.sh"

echo "release workflow contract tests: PASS"
