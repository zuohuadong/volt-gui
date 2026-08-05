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
UNINSTALLER="voltui-uninstall.exe"

[ -d "$payload_input" ] || { echo "Windows payload directory is missing: $payload_input" >&2; exit 1; }
PAYLOAD="$(cd "$payload_input" && pwd)"

required_payload=(
	"$BINNAME.exe"
	"$UPDATE_HELPER"
	"$CLINAME.exe"
	"$UNINSTALLER"
)
for name in "${required_payload[@]}"; do
	[ -s "$PAYLOAD/$name" ] || { echo "Windows payload file is missing or empty: $name" >&2; exit 1; }
done

payload_exe_count=$(find "$PAYLOAD" -maxdepth 1 -type f -iname '*.exe' | wc -l | tr -d '[:space:]')
[ "$payload_exe_count" = "${#required_payload[@]}" ] || {
	echo "Windows payload must contain exactly ${#required_payload[@]} executables, found $payload_exe_count" >&2
	exit 1
}

# Replace every source consumed by project.nsi before compiling the installer.
# Copying preserves the Authenticode certificate table returned by SignPath.
cp "$PAYLOAD/$BINNAME.exe" "$BIN_DIR/$BINNAME.exe"
cp "$PAYLOAD/$UPDATE_HELPER" "$INSTALLER_DIR/$UPDATE_HELPER"
cp "$PAYLOAD/$CLINAME.exe" "$INSTALLER_DIR/$CLINAME.exe"

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
uninstaller_path="$PAYLOAD/$UNINSTALLER"
if command -v cygpath >/dev/null 2>&1; then
	uninstaller_path="$(cygpath -w "$uninstaller_path")"
fi
(
	cd "$INSTALLER_DIR"
	makensis \
		"-D${binary_define}=${binary_path}" \
		"-DARG_VOLTUI_SIGNED_UNINSTALLER=${uninstaller_path}" \
		project.nsi
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

portable_payload=("$BINNAME.exe" "$UPDATE_HELPER" "$CLINAME.exe")
for portable_name in "${portable_payload[@]}"; do
	cp "$PAYLOAD/$portable_name" "$portable_staging/$portable_name"
done
if [ -s "$INSTALLER_DIR/bundled.env" ]; then
	cp "$INSTALLER_DIR/bundled.env" "$portable_staging/bundled.env"
fi
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
for name in "${required_payload[@]}"; do
	cp "$PAYLOAD/$name" "$installer_bundle/$name"
done

echo "==> rebuilt Windows $arch installer and portable archive from $PAYLOAD"
