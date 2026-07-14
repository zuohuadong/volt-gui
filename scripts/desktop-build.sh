#!/usr/bin/env bash
# Build and package the Wails desktop app for one platform. Wails cannot
# cross-compile a CGO+webview binary, so this runs on a native runner per target
# (see .github/workflows/release-desktop.yml) and is invoked once per matrix entry.
#
# Output lands in <repo>/dist/ with stable, platform-keyed names that
# desktop/cmd/sign's `manifest` subcommand maps back to update.PlatformKey:
#   macOS:   <App>-darwin-<arch>.zip                     (ditto archive; updater channel)
#            <App>-darwin-universal.dmg                  (drag-to-install; human download)
#   Windows: <App>-windows-<arch>-installer.exe          (NSIS per-user installer; updater channel)
#            <App>-windows-<arch>.zip                    (portable human download)
#            <App>-windows-<arch>-prerequisites.zip     (offline Microsoft runtimes)
#   Linux:   <App>-linux-<arch>.tar.gz                   (bare binary; updater channel)
#            <App>-linux-<arch>.deb                      (Debian/Ubuntu package; human download)
# <App> defaults to "VoltUI"; forks override with DESKTOP_APP_NAME (e.g. "Anyong").
#
# Usage: scripts/desktop-build.sh <os/arch> <version> [channel]
#   e.g. scripts/desktop-build.sh darwin/arm64 v1.1.0
#        scripts/desktop-build.sh darwin/arm64 v1.5.0-canary.20260608.42 canary
set -euo pipefail

PLATFORM="${1:?usage: desktop-build.sh <os/arch> <version> [channel]}"
VERSION="${2:?usage: desktop-build.sh <os/arch> <version> [channel]}"
CHANNEL="${3:-stable}"

os="${PLATFORM%/*}"
arch="${PLATFORM#*/}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPNAME="${DESKTOP_APP_NAME:-VoltUI}"  # release bundle/artifact name (forks override via DESKTOP_APP_NAME)
RUNTIME_BRAND="${VOLTUI_BRAND_NAME:-VoltUI}"
BINNAME="voltui-desktop"      # wails.json outputfilename -> linux binary name
COMPUTER_USE_MCP_VERSION="${COMPUTER_USE_MCP_VERSION:-6.2.0}"
BUN_RUNTIME_VERSION="${BUN_RUNTIME_VERSION:-1.3.14}"
COMPUTER_USE_MCP_TMP="$(mktemp -d)"
COMPUTER_USE_MCP_RESOURCE="$COMPUTER_USE_MCP_TMP/computer-use-mcp"
COMPUTER_USE_RUNTIME_RESOURCE="$COMPUTER_USE_MCP_TMP/computer-use-runtime"
COREUTILS_TMP=""
COREUTILS_RESOURCE=""
WINDOWS_PREREQUISITES_TMP=""
WINDOWS_PREREQUISITES_RESOURCE=""

cleanup() {
	rm -rf "$COMPUTER_USE_MCP_TMP"
	[ -z "$COREUTILS_TMP" ] || rm -rf "$COREUTILS_TMP"
	[ -z "$WINDOWS_PREREQUISITES_TMP" ] || rm -rf "$WINDOWS_PREREQUISITES_TMP"
}
trap cleanup EXIT

copy_computer_use_mcp() {
	local dest="$1"
	rm -rf "$dest"
	mkdir -p "$(dirname "$dest")"
	cp -R "$COMPUTER_USE_MCP_RESOURCE" "$dest"
}

copy_computer_use_runtime() {
	local dest="$1"
	rm -rf "$dest"
	mkdir -p "$(dirname "$dest")"
	cp -R "$COMPUTER_USE_RUNTIME_RESOURCE" "$dest"
}

copy_coreutils() {
	local dest="$1"
	[ -n "$COREUTILS_RESOURCE" ] && [ -f "$COREUTILS_RESOURCE/voltui-coreutils-path.txt" ] && \
		[ -f "$COREUTILS_RESOURCE/coreutils-system-installer.exe" ] || {
			echo "Coreutils resource is missing or incomplete" >&2
			exit 1
		}
	rm -rf "$dest"
	mkdir -p "$(dirname "$dest")"
	cp -R "$COREUTILS_RESOURCE" "$dest"
}

echo "==> stage @zavora-ai/computer-use-mcp@$COMPUTER_USE_MCP_VERSION"
node "$ROOT/scripts/stage-computer-use-mcp.mjs" "$COMPUTER_USE_MCP_RESOURCE" "$COMPUTER_USE_MCP_VERSION" "$PLATFORM"
echo "==> stage Bun runtime $BUN_RUNTIME_VERSION"
node "$ROOT/scripts/stage-bun-runtime.mjs" "$COMPUTER_USE_RUNTIME_RESOURCE" "$BUN_RUNTIME_VERSION" "$PLATFORM"

cd "$ROOT/desktop"

# Stamp the version resource (Windows file properties, macOS CFBundleVersion) from
# the tag. Wails feeds info.productVersion into goversioninfo and NSIS's
# VIFileVersion, both of which demand a strictly numeric X.X.X, so strip the
# leading "v" AND any prerelease suffix (a `-rc1` tag would otherwise abort the
# installer build). The full tag still rides in ldflags for the in-app version.
numver="${VERSION#v}"; numver="${numver%%-*}"
node -e 'const fs=require("fs"),f="wails.json",j=JSON.parse(fs.readFileSync(f,"utf8"));j.info.productVersion=process.argv[1];fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n")' "$numver"

# NSIS installer is Windows-only (Wails requires a single windows target for -nsis).
ldflags="-X main.version=$VERSION -X main.channel=$CHANNEL -X 'voltui/internal/config.defaultBrandName=$RUNTIME_BRAND'"
[ "$os" = "darwin" ] && [ "${HAS_APPLE_CERT:-}" = "true" ] && ldflags="$ldflags -X main.macSelfUpdate=true"
UPDATE_HELPER="voltui-update-helper.exe"
if [ "$os" = windows ]; then
	COREUTILS_TMP="$(mktemp -d)"
	COREUTILS_RESOURCE="$COREUTILS_TMP/coreutils"
	WINDOWS_PREREQUISITES_TMP="$(mktemp -d)"
	WINDOWS_PREREQUISITES_RESOURCE="$WINDOWS_PREREQUISITES_TMP/prerequisites"
	echo "==> stage bundled Microsoft Coreutils"
	node "$ROOT/scripts/stage-coreutils.mjs" "$COREUTILS_RESOURCE" "$PLATFORM"
	echo "==> stage offline Microsoft Windows prerequisites"
	node "$ROOT/scripts/stage-windows-prerequisites.mjs" "$WINDOWS_PREREQUISITES_RESOURCE" "$PLATFORM"
	echo "==> go build Windows update helper"
	GOOS=windows GOARCH="$arch" go build -trimpath -ldflags="-s -w" \
		-o "build/windows/installer/$UPDATE_HELPER" ./cmd/update-helper

	# OEM 网关密钥 sidecar: 当 CI 注入了 XIGU_API_KEY secret 时, 写入随包发布的
	# bundled.env (NSIS 按需打包)。运行时优先级最低, 用户凭据/环境变量覆盖此值。
	if [ -n "${XIGU_API_KEY:-}" ]; then
		echo "==> writing bundled.env sidecar (XIGU_API_KEY present)"
		{
			echo "# 西谷智灯暗涌系统 — OEM 内置网关密钥 (build-time injected from XIGU_API_KEY)."
			echo "# 优先级最低: 用户在凭据存储或环境变量配置的同名 key 始终覆盖此值。请勿手工编辑。"
			printf 'XIGU_API_KEY=%s\n' "$XIGU_API_KEY"
		} > build/windows/installer/bundled.env
	else
		rm -f build/windows/installer/bundled.env
	fi
	copy_computer_use_mcp "build/windows/installer/computer-use-mcp"
	copy_computer_use_runtime "build/windows/installer/computer-use-runtime"
	copy_coreutils "build/windows/installer/coreutils"
fi
build_args=(-clean -platform "$PLATFORM" -ldflags "$ldflags")
[ "$os" = windows ] && build_args+=(-nsis -webview2 embed)
# Link cgo against WebKitGTK 4.1: 4.0 (libwebkit2gtk-4.0.so.37) is gone on
# Ubuntu 24.04+/Fedora 40+, while 4.1 ships from Ubuntu 22.04 onward.
[ "$os" = linux ] && build_args+=(-tags webkit2_41)

echo "==> wails build ${build_args[*]}"
wails build "${build_args[@]}"

mkdir -p "$ROOT/dist"

case "$os" in
darwin)
		# Wails names the bundle after outputfilename (${BINNAME}.app); repackage
		# it as VoltUI.app for a clean user-facing name.
	staging=$(mktemp -d)
	app="$staging/${APPNAME}.app"
	cp -R "build/bin/${BINNAME}.app" "$app"
	copy_computer_use_mcp "$app/Contents/Resources/computer-use-mcp"
	copy_computer_use_runtime "$app/Contents/Resources/computer-use-runtime"

	# Two signing paths, selected by HAS_APPLE_CERT (set by release-desktop.yml when
	# the APPLE_* secrets are present). With a real Developer ID cert + notarization
	# key we sign with a hardened runtime, notarize, and staple — a downloaded build
	# then opens with no Gatekeeper prompt. Without it we ad-hoc sign as before (still
	# un-notarized; users clear the quarantine attribute per desktop/README.md). The
	# fallback keeps fork/local builds working with no secrets configured.
	if [ "${HAS_APPLE_CERT:-}" = "true" ]; then
		identity="$(security find-identity -v -p codesigning | awk -F'"' '/Developer ID Application/{print $2; exit}')"
		[ -n "$identity" ] || { echo "HAS_APPLE_CERT=true but no 'Developer ID Application' identity found in the keychain" >&2; exit 1; }
		echo "==> codesign (Developer ID): $identity"
		codesign --force --deep --timestamp --options runtime \
			--entitlements "$ROOT/desktop/build/darwin/entitlements.plist" \
			-s "$identity" "$app"
		# notarytool wants an archive, not a bare bundle: zip the .app, submit, wait,
		# then staple the ticket back onto the bundle so it verifies offline.
		ditto -c -k --keepParent "$app" "$staging/notarize.zip"
		echo "==> notarytool submit (app)"
		xcrun notarytool submit "$staging/notarize.zip" \
			--key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY_ID" \
			--issuer "$APPLE_API_ISSUER_ID" --wait
		xcrun stapler staple "$app"
	else
		# Ad-hoc cuts the "is damaged" error somewhat but is NOT notarized; users may
		# still need `xattr -dr com.apple.quarantine` (see desktop/README.md).
		codesign --force --deep -s - "$app"
	fi

	if [ "$arch" = universal ]; then
		# One universal .app covers Intel + Apple Silicon; publish it under both
		# manifest keys so the updater's darwin-arm64/darwin-amd64 lookup finds it
		# (avoids a scarce macos-13 Intel runner).
		ditto -c -k --keepParent "$app" "$ROOT/dist/${APPNAME}-darwin-arm64.zip"
		ditto -c -k --keepParent "$app" "$ROOT/dist/${APPNAME}-darwin-amd64.zip"
	else
		ditto -c -k --keepParent "$app" "$ROOT/dist/${APPNAME}-darwin-${arch}.zip"
	fi
	# A drag-to-Applications .dmg for first-time human download. Named -universal so
	# cmd/sign's substring match (darwin-arm64/darwin-amd64) skips it: the .zip stays
	# the updater channel, the .dmg is release-page only. create-dmg can exit nonzero
	# while still writing the image, so gate on the file existing, not the exit code.
	dmgsrc=$(mktemp -d)
	cp -R "$app" "$dmgsrc/${APPNAME}.app"
	dmg="$ROOT/dist/${APPNAME}-darwin-universal.dmg"
	dmg_args=(
		--volname "$APPNAME"
		--window-size 540 380
		--icon-size 110
		--icon "${APPNAME}.app" 150 190
		--app-drop-link 390 190
		--no-internet-enable
	)
	if [ "${VOLTUI_DMG_SKIP_FINDER:-0}" = "1" ]; then
		dmg_args+=(--skip-jenkins)
	fi
	create-dmg "${dmg_args[@]}" "$dmg" "$dmgsrc" || true
	[ -f "$dmg" ] || { echo "create-dmg did not produce $dmg" >&2; exit 1; }
	# The .dmg is a separately-downloaded artifact, so sign + notarize + staple the
	# disk image itself too — the stapled .app inside isn't enough for the image.
	if [ "${HAS_APPLE_CERT:-}" = "true" ]; then
		codesign --force --timestamp -s "$identity" "$dmg"
		echo "==> notarytool submit (dmg)"
		xcrun notarytool submit "$dmg" \
			--key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY_ID" \
			--issuer "$APPLE_API_ISSUER_ID" --wait
		xcrun stapler staple "$dmg"
	fi
	rm -rf "$staging" "$dmgsrc"
	;;
windows)
	# `wails build -nsis` writes the installer under build/bin; its exact name
	# varies, so glob for it and copy to a stable, platform-keyed name.
	installer=$(ls build/bin/*installer*.exe 2>/dev/null | head -n1 || true)
	[ -n "$installer" ] || { echo "no NSIS installer found in build/bin" >&2; exit 1; }
	cp "$installer" "$ROOT/dist/${APPNAME}-windows-${arch}-installer.exe"
	portable=$(find build/bin -maxdepth 1 -type f -name "*.exe" ! -name "*installer*.exe" | head -n1 || true)
	[ -n "$portable" ] || { echo "no portable Windows exe found in build/bin" >&2; exit 1; }
	staging=$(mktemp -d)
	cp "$portable" "$staging/${APPNAME}.exe"
	copy_computer_use_mcp "$staging/computer-use-mcp"
	copy_computer_use_runtime "$staging/computer-use-runtime"
	copy_coreutils "$staging/coreutils"
	helper="build/windows/installer/$UPDATE_HELPER"
	if [ -f "$helper" ]; then
		cp "$helper" "$staging/$UPDATE_HELPER"
	fi
	if command -v cygpath >/dev/null 2>&1 && command -v powershell.exe >/dev/null 2>&1; then
		staging_win=$(cygpath -w "$staging")
		zip_win=$(cygpath -w "$ROOT/dist/${APPNAME}-windows-${arch}.zip")
		powershell.exe -NoProfile -Command "Compress-Archive -Force -Path '$staging_win\\*' -DestinationPath '$zip_win'"
	else
		( cd "$staging" && zip -q -r "$ROOT/dist/${APPNAME}-windows-${arch}.zip" . )
	fi
	rm -rf "$staging"
	prerequisites_zip="$ROOT/dist/${APPNAME}-windows-${arch}-prerequisites.zip"
	if command -v cygpath >/dev/null 2>&1 && command -v powershell.exe >/dev/null 2>&1; then
		prerequisites_win=$(cygpath -w "$WINDOWS_PREREQUISITES_RESOURCE")
		prerequisites_zip_win=$(cygpath -w "$prerequisites_zip")
		powershell.exe -NoProfile -Command "Compress-Archive -Force -Path '$prerequisites_win\\*' -DestinationPath '$prerequisites_zip_win'"
	else
		( cd "$WINDOWS_PREREQUISITES_RESOURCE" && zip -q -r "$prerequisites_zip" . )
	fi
	;;
linux)
	copy_computer_use_mcp "build/computer-use-mcp"
	copy_computer_use_runtime "build/computer-use-runtime"
	staging=$(mktemp -d)
	cp "build/bin/$BINNAME" "$staging/$BINNAME"
	copy_computer_use_mcp "$staging/computer-use-mcp"
	copy_computer_use_runtime "$staging/computer-use-runtime"
	tar -czf "$ROOT/dist/${APPNAME}-linux-${arch}.tar.gz" -C "$staging" "$BINNAME" "computer-use-mcp" "computer-use-runtime"
	rm -rf "$staging"
	# Also build a .deb for Debian/Ubuntu users (goreleaser/nfpm; see
	# desktop/build/linux/nfpm.yaml). Human-download only: the Linux updater channel
	# stays the tarball and cmd/sign's manifest skips .deb files. nfpm reads
	# $DEB_VERSION/$DEB_ARCH — dpkg wants a strict numeric version, so reuse numver.
	DEB_VERSION="$numver" DEB_ARCH="$arch" \
		nfpm package --config build/linux/nfpm.yaml --packager deb \
		--target "$ROOT/dist/${APPNAME}-linux-${arch}.deb"
	;;
*)
	echo "unsupported os: $os" >&2
	exit 1
	;;
esac

echo "==> packaged into dist/:"
ls -la "$ROOT/dist"
