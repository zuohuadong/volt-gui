#!/usr/bin/env bash
# Rebuild the Windows portable archive and NSIS installer from one canonical
# payload directory. The release workflow calls this once with unsigned files
# after compilation, then again with Authenticode-signed files returned by
# SignPath. Re-running makensis after payload signing is what makes the
# installed executables signed too; signing only the finished NSIS file signs
# the container, not the files that Defender scans after installation.
set -euo pipefail

arch="${1:?usage: package-windows-desktop.sh <amd64|arm64> <payload-dir>}"
payload_input="${2:?usage: package-windows-desktop.sh <amd64|arm64> <payload-dir>}"

case "$arch" in
amd64 | arm64) ;;
*)
	echo "unsupported Windows architecture: $arch" >&2
	exit 1
	;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP="$ROOT/desktop"
INSTALLER_DIR="$DESKTOP/build/windows/installer"
BIN_DIR="$DESKTOP/build/bin"
DIST="$ROOT/dist"
APPNAME="${DESKTOP_APP_NAME:-VoltUI}"
BINNAME="voltui-desktop"
UPDATE_HELPER="voltui-update-helper.exe"
CLINAME="voltui-cli"

[ -d "$payload_input" ] || { echo "Windows payload directory is missing: $payload_input" >&2; exit 1; }
PAYLOAD="$(cd "$payload_input" && pwd)"

required_payload=(
	"$BINNAME.exe"
	"$UPDATE_HELPER"
)
for name in "${required_payload[@]}"; do
	[ -s "$PAYLOAD/$name" ] || { echo "Windows payload file is missing or empty: $name" >&2; exit 1; }
done

payload_files=("${required_payload[@]}")
[ ! -s "$PAYLOAD/$CLINAME.exe" ] || payload_files+=("$CLINAME.exe")

payload_exe_count=$(find "$PAYLOAD" -maxdepth 1 -type f -iname '*.exe' | wc -l | tr -d '[:space:]')
[ "$payload_exe_count" = "${#payload_files[@]}" ] || {
	echo "Windows payload contains an unexpected executable: found $payload_exe_count, want ${#payload_files[@]}" >&2
	exit 1
}

# Replace every source consumed by project.nsi before compiling the installer.
# Copying preserves the Authenticode certificate table returned by SignPath.
cp "$PAYLOAD/$BINNAME.exe" "$BIN_DIR/$BINNAME.exe"
cp "$PAYLOAD/$UPDATE_HELPER" "$INSTALLER_DIR/$UPDATE_HELPER"

[ -s "$INSTALLER_DIR/wails_tools.nsh" ] || {
	echo "wails_tools.nsh is missing; run the initial Wails -nsis build first" >&2
	exit 1
}
[ -s "$INSTALLER_DIR/tmp/MicrosoftEdgeWebview2Setup.exe" ] || {
	echo "embedded WebView2 bootstrapper is missing; run the initial Wails -nsis build first" >&2
	exit 1
}

# Wails documents project.nsi as manually invokable with the architecture
# binary define. Delete only generated installers so a stale first-pass package
# cannot be mistaken for the rebuilt payload-signed installer.
find "$BIN_DIR" -maxdepth 1 -type f -name '*installer*.exe' -delete
binary_path="$BIN_DIR/$BINNAME.exe"
if command -v cygpath >/dev/null 2>&1; then
	binary_path="$(cygpath -w "$binary_path")"
fi
binary_define="ARG_WAILS_AMD64_BINARY"
[ "$arch" = arm64 ] && binary_define="ARG_WAILS_ARM64_BINARY"
(
	cd "$INSTALLER_DIR"
	makensis "-D${binary_define}=${binary_path}" project.nsi
)

installer=$(find "$BIN_DIR" -maxdepth 1 -type f -name '*installer*.exe' -print -quit)
[ -n "$installer" ] && [ -s "$installer" ] || { echo "makensis did not produce a Windows installer" >&2; exit 1; }

mkdir -p "$DIST"
dist_installer="$DIST/${APPNAME}-windows-${arch}-installer.exe"
dist_portable="$DIST/${APPNAME}-windows-${arch}.zip"
cp "$installer" "$dist_installer"

portable_staging=$(mktemp -d)
portable_staging_root="${TMPDIR:-/tmp}"
portable_staging_root="${portable_staging_root%/}"
cleanup() {
	case "$portable_staging" in
	"$portable_staging_root"/* | /tmp/*) rm -rf -- "$portable_staging" ;;
	*) echo "refusing to clean unexpected portable staging directory: $portable_staging" >&2 ;;
	esac
}
trap cleanup EXIT

for name in "${payload_files[@]}"; do
	cp "$PAYLOAD/$name" "$portable_staging/$name"
done
for resource in computer-use-mcp computer-use-runtime coreutils; do
	[ -d "$INSTALLER_DIR/$resource" ] || { echo "Windows runtime resource is missing: $resource" >&2; exit 1; }
	cp -R "$INSTALLER_DIR/$resource" "$portable_staging/$resource"
done
"$ROOT/scripts/verify-windows-portable.sh" "$portable_staging"

rm -f -- "$dist_portable"
if command -v cygpath >/dev/null 2>&1 && command -v powershell.exe >/dev/null 2>&1; then
	portable_staging_win="$(cygpath -w "$portable_staging")"
	dist_portable_win="$(cygpath -w "$dist_portable")"
	powershell.exe -NoProfile -Command \
		"Compress-Archive -Force -Path '$portable_staging_win\\*' -DestinationPath '$dist_portable_win'"
else
	command -v zip >/dev/null 2>&1 || { echo "zip is required for Windows portable packaging" >&2; exit 1; }
	(
		cd "$portable_staging"
		zip -q -r "$dist_portable" .
	)
fi

# The second SignPath request signs the outer installer only after verifying
# these already-signed payload files. Keeping one flat, exact bundle makes the
# artifact configuration fail closed if a required installed executable is
# missing.
installer_bundle="$DESKTOP/build/windows/installer-signing-bundle"
rm -rf -- "$installer_bundle"
mkdir -p "$installer_bundle"
cp "$dist_installer" "$installer_bundle/"
for name in "${payload_files[@]}"; do
	cp "$PAYLOAD/$name" "$installer_bundle/$name"
done

echo "==> rebuilt Windows $arch installer and portable archive from $PAYLOAD"
