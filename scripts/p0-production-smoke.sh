#!/usr/bin/env bash
# P0 production-readiness smoke for the desktop workbench.
#
# Defaults are deterministic and do not require provider secrets. Expensive or
# credentialed checks are opt-in:
#   VOLTUI_P0_REAL_PROVIDER=1      run a real-provider tool loop via e2ebench
#   VOLTUI_P0_DESKTOP_PACKAGE=1    build a platform package through ./prod_test
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

run() {
	printf '\n==> %s\n' "$*"
	"$@"
}

require_cmd() {
	command -v "$1" >/dev/null 2>&1 || {
		printf 'missing required command: %s\n' "$1" >&2
		exit 1
	}
}

write_stub_frontend() {
	mkdir -p desktop/frontend/dist
	if [[ ! -f desktop/frontend/dist/index.html ]]; then
		printf '<!doctype html><title>p0-smoke</title>\n' > desktop/frontend/dist/index.html
	fi
}

run_frontend_build() {
	if ! command -v pnpm >/dev/null 2>&1; then
		printf '\n==> skipping frontend build: pnpm not found\n'
		return
	fi
	run pnpm --dir desktop/frontend build
	printf '\n' > desktop/frontend/dist/.gitkeep
}

run_real_provider_smoke() {
	if [[ "${VOLTUI_P0_REAL_PROVIDER:-0}" != "1" ]]; then
		printf '\n==> skipping real provider smoke: set VOLTUI_P0_REAL_PROVIDER=1 to enable\n'
		return
	fi

	local key_env="${VOLTUI_P0_PROVIDER_API_KEY_ENV:-DEEPSEEK_API_KEY}"
	if [[ -z "${!key_env:-}" ]]; then
		printf 'missing %s for real provider smoke\n' "$key_env" >&2
		exit 1
	fi

	local tmp bin suite home app_support xdg_config go_cache go_mod_cache
	tmp="$(mktemp -d)"
	cleanup_real_provider_tmp() {
		chmod -R u+w "$tmp" 2>/dev/null || true
		rm -rf "$tmp" 2>/dev/null || true
	}
	trap cleanup_real_provider_tmp RETURN
	bin="$tmp/voltui"
	suite="$tmp/suite"
	home="$tmp/home"
	app_support="$home/Library/Application Support/voltui"
	xdg_config="$home/.config/voltui"
	go_cache="${GOCACHE:-$tmp/go-build-cache}"
	go_mod_cache="${GOMODCACHE:-$(go env GOMODCACHE)}"
	if [[ -z "$go_mod_cache" ]]; then
		go_mod_cache="$tmp/go-mod-cache"
	fi

	run go build -o "$bin" ./cmd/voltui

	mkdir -p "$suite/tasks/p0-provider-tool-loop/workdir" "$app_support" "$xdg_config"
	cat > "$suite/tasks/p0-provider-tool-loop/task.toml" <<'EOF_TASK'
prompt = "Create a file named p0_provider_smoke.txt in the current directory containing exactly P0_PROVIDER_SMOKE_OK, then answer briefly."
max_steps = 8
timeout_sec = 300
EOF_TASK
	cat > "$suite/tasks/p0-provider-tool-loop/verify.sh" <<'EOF_VERIFY'
#!/usr/bin/env bash
set -euo pipefail
test "$(cat p0_provider_smoke.txt)" = "P0_PROVIDER_SMOKE_OK"
EOF_VERIFY
	chmod +x "$suite/tasks/p0-provider-tool-loop/verify.sh"

	local cfg="$tmp/voltui-p0.toml"
	cat > "$cfg" <<EOF_CFG
default_model = "p0"

[[providers]]
name = "p0"
kind = "openai"
base_url = "${VOLTUI_P0_PROVIDER_BASE_URL:-https://api.deepseek.com}"
model = "${VOLTUI_P0_PROVIDER_MODEL:-deepseek-v4-flash}"
api_key_env = "$key_env"
context_window = 20000

[permissions]
mode = "allow"

[codegraph]
enabled = false
EOF_CFG
	cp "$cfg" "$app_support/config.toml"
	cp "$cfg" "$xdg_config/config.toml"

	(
		export HOME="$home"
		export XDG_CONFIG_HOME="$home/.config"
		export GOCACHE="$go_cache"
		export GOMODCACHE="$go_mod_cache"
		run go run ./cmd/e2ebench -bin "$bin" -suite "$suite" -model p0 -budget 200000
	)
}

require_cmd go

run go test ./internal/agent -run 'TestAgentEmitsRetryingThenStreams|TestGateBlocksDeniedCall|TestRunPermissionDeniedToolCallPreservesRecovery|TestRunRecoversInterruptedPartialToolCallWithoutExecutingIt' -count=1

write_stub_frontend
(
	cd desktop
	run go test ./... -run 'TestWailsBindingSmoke|TestSubmitDisplayToTabRejectsMissingProviderKeyBeforeTurn|TestEnsureTabModelReadyFallsBackFromKeylessRestoredModel|TestRecoverToPending|TestFlushPendingCrash|TestAppPlatformReturnsRuntimeGOOS' -count=1
)

run_frontend_build
run_real_provider_smoke

if [[ "${VOLTUI_P0_DESKTOP_PACKAGE:-0}" == "1" ]]; then
	PROD_TEST_OPEN_DIST=0 run ./prod_test
else
	printf '\n==> skipping desktop package smoke: set VOLTUI_P0_DESKTOP_PACKAGE=1 to enable\n'
fi

run git diff --check

printf '\nP0 production smoke completed.\n'
