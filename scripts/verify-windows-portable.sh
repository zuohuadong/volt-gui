#!/usr/bin/env bash
# Verify the exact Windows portable release unit before Compress-Archive sees it.
# This must run on the Windows staging directory: NTFS treats file names
# case-insensitively, so the branded entry point and the CLI must never collide.
set -euo pipefail

staging="${1:?usage: verify-windows-portable.sh STAGING_DIR}"
portable_app_name="${WINDOWS_PORTABLE_APP_NAME:-Reasonix}"
portable_binary_prefix="${WINDOWS_PORTABLE_BINARY_PREFIX:-reasonix}"
[ -d "$staging" ] || { echo "Windows portable staging directory is missing: $staging" >&2; exit 1; }

required=(
	"$portable_app_name.exe"
	"$portable_binary_prefix-cli.exe"
	"$portable_binary_prefix-desktop.exe"
	"$portable_binary_prefix-guard.exe"
	"$portable_binary_prefix-launcher.exe"
	"$portable_binary_prefix-update-helper.exe"
)

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

if [ "${#actual[@]}" -ne "${#required[@]}" ]; then
	echo "Windows portable entry count is ${#actual[@]}, want ${#required[@]}: ${actual[*]}" >&2
	exit 1
fi

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

# The branded entry point is the backward-compatible desktop entry point. Prove it is the
# GUI Guard launcher rather than merely trusting the copy commands above.
cmp -s "$staging/$portable_app_name.exe" "$staging/$portable_binary_prefix-launcher.exe" || {
	echo "$portable_app_name.exe is not the packaged GUI launcher" >&2
	exit 1
}
if cmp -s "$staging/$portable_app_name.exe" "$staging/$portable_binary_prefix-cli.exe"; then
	echo "$portable_app_name.exe was overwritten by the CLI sidecar" >&2
	exit 1
fi
