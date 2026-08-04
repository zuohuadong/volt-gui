#!/usr/bin/env bash
# Verify the exact Windows portable release unit before Compress-Archive sees it.
# This must run on the Windows staging directory so case-insensitive filename
# collisions and missing runtime resources are caught before archiving.
set -euo pipefail

staging="${1:?usage: verify-windows-portable.sh STAGING_DIR}"
[ -d "$staging" ] || { echo "Windows portable staging directory is missing: $staging" >&2; exit 1; }

required=(
	"voltui-desktop.exe"
	"voltui-update-helper.exe"
	"voltui-cli.exe"
)
allowed=("${required[@]}")

actual=()
for path in "$staging"/*.exe; do
	[ -f "$path" ] || continue
	name="${path##*/}"
	folded=$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')
	if [ "${#actual[@]}" -gt 0 ]; then
		for previous in "${actual[@]}"; do
			previous_folded=$(printf '%s' "$previous" | tr '[:upper:]' '[:lower:]')
			if [ "$folded" = "$previous_folded" ]; then
				echo "Windows portable names collide case-insensitively: $previous and $name" >&2
				exit 1
			fi
		done
	fi
	actual+=("$name")
done

for expected in "${required[@]}"; do
	found=false
	for name in "${actual[@]}"; do
		if [ "$name" = "$expected" ]; then
			found=true
			break
		fi
	done
	$found || { echo "Windows portable entry is missing or has wrong case: $expected" >&2; exit 1; }
done

for name in "${actual[@]}"; do
	accepted=false
	for candidate in "${allowed[@]}"; do
		if [ "$name" = "$candidate" ]; then
			accepted=true
			break
		fi
	done
	$accepted || { echo "Windows portable entry is unexpected: $name" >&2; exit 1; }
done

[ -s "$staging/computer-use-mcp/node_modules/@zavora-ai/computer-use-mcp/dist/server.js" ] || {
	echo "Windows portable computer-use MCP server is missing" >&2
	exit 1
}
bun_runtime=$(find "$staging/computer-use-runtime" -type f \( -name bun -o -name bun.exe \) -print -quit 2>/dev/null || true)
[ -n "$bun_runtime" ] || { echo "Windows portable Bun runtime is missing" >&2; exit 1; }
[ -s "$staging/coreutils/voltui-coreutils-path.txt" ] || { echo "Windows portable Coreutils metadata is missing" >&2; exit 1; }
[ -s "$staging/coreutils/coreutils-system-installer.exe" ] || { echo "Windows portable Coreutils installer is missing" >&2; exit 1; }
