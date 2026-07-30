#!/usr/bin/env bash
# Build and package the Wails desktop app for one platform. Wails cannot
# cross-compile a CGO+webview binary, so this runs on a native runner per target
# (see .github/workflows/release-desktop.yml) and is invoked once per matrix entry.
#
# Output lands in <repo>/dist/ with stable, platform-keyed names that
# desktop/cmd/sign's `manifest` subcommand maps back to update.PlatformKey:
#   macOS:   VoltUI-darwin-<arch>.zip                  (ditto archive; updater channel)
#            VoltUI-darwin-universal.dmg               (drag-to-install; human download)
#   Windows: VoltUI-windows-<arch>-installer.exe       (NSIS per-user installer; updater channel)
#            VoltUI-windows-<arch>.zip                 (portable human download)
#   Linux:   VoltUI-linux-<arch>.tar.gz                (desktop + guard + CLI; portable updater)
#            VoltUI-linux-<arch>.deb                   (Debian/Ubuntu package; native updater)
#
# Usage: scripts/desktop-build.sh <os/arch> <version> [channel]
#   e.g. scripts/desktop-build.sh darwin/arm64 v1.1.0
#        scripts/desktop-build.sh darwin/arm64 v1.5.0-preview.42 preview
set -euo pipefail

PLATFORM="${1:?usage: desktop-build.sh <os/arch> <version> [channel]}"
VERSION="${2:?usage: desktop-build.sh <os/arch> <version> [channel]}"
CHANNEL="${3:-stable}"

os="${PLATFORM%/*}"
arch="${PLATFORM#*/}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPNAME="VoltUI"            # wails.json productName -> VoltUI.app
BINNAME="voltui-desktop"    # wails.json outputfilename -> linux binary name
CLINAME="reasonix"            # bundled CLI sidecar used for remote serve upload
WINDOWS_CLINAME="voltui-cli" # Windows cannot store VoltUI.exe and reasonix.exe separately
GUARDNAME="voltui-guard"
LAUNCHERNAME="voltui-launcher"
windows_resource_tool_dir=""

# desktop/ is a nested Go module, so the Go toolchain cannot discover the
# repository VCS revision for the Wails binary. Link the same source identity
# into both Desktop and its CLI sidecar before this script mutates packaging
# metadata such as wails.json.
SOURCE_REVISION="$(git -C "$ROOT" rev-parse --verify HEAD)" 2>/dev/null || SOURCE_REVISION=""
if [ -z "$SOURCE_REVISION" ]; then
	SOURCE_REVISION="0000000000000000000000000000000000000000"
elif ! git -C "$ROOT" diff-index --quiet HEAD --; then
	SOURCE_REVISION="$SOURCE_REVISION+dirty"
fi
source_revision_ldflag="-X voltui/internal/remote/protocol.linkedSourceRevision=$SOURCE_REVISION"

cleanup() {
	if [ -n "$windows_resource_tool_dir" ]; then
		rm -rf "$windows_resource_tool_dir"
	fi
}
trap cleanup EXIT

cd "$ROOT/desktop"

build_guard() {
	echo "==> go build VoltUI Guard"
	mkdir -p "$(dirname "$guard_out")"
	if [ "$arch" = universal ]; then
		guard_tmp=$(mktemp -d)
		(cd "$ROOT" && GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=$VERSION" -o "$guard_tmp/amd64" ./cmd/reasonix-guard)
		(cd "$ROOT" && GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=$VERSION" -o "$guard_tmp/arm64" ./cmd/reasonix-guard)
		lipo -create "$guard_tmp/amd64" "$guard_tmp/arm64" -output "$guard_out"
		rm -rf "$guard_tmp"
	else
		(cd "$ROOT" && GOOS="$os" GOARCH="$arch" CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=$VERSION" -o "$guard_out" ./cmd/reasonix-guard)
	fi
}

build_cli() {
	echo "==> go build VoltUI CLI sidecar"
	mkdir -p "$(dirname "$cli_out")"
	if [ "$arch" = universal ]; then
		cli_tmp=$(mktemp -d)
		(cd "$ROOT" && GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=$VERSION $source_revision_ldflag" -o "$cli_tmp/amd64" ./cmd/reasonix)
		(cd "$ROOT" && GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=$VERSION $source_revision_ldflag" -o "$cli_tmp/arm64" ./cmd/reasonix)
		lipo -create "$cli_tmp/amd64" "$cli_tmp/arm64" -output "$cli_out"
		rm -rf "$cli_tmp"
	else
		(cd "$ROOT" && GOOS="$os" GOARCH="$arch" CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=$VERSION $source_revision_ldflag" -o "$cli_out" ./cmd/reasonix)
	fi
}

stamp_windows_executable() {
	local target="$1"
	local description="$2"
	local internal_name="$3"
	local original_filename="$4"
	"$windows_resource_tool" \
		-exe "$target" \
		-icon "$ROOT/desktop/build/windows/icon.ico" \
		-version "$numver" \
		-description "$description" \
		-internal-name "$internal_name" \
		-original-filename "$original_filename"
}

validate_volt_model_bundle() {
	local base_url="$1"
	local api_key="$2"

	if [ -z "$base_url" ] || [ -z "$api_key" ]; then
		echo "OEM model bundle requires both volt_MODEL_BASE_URL and volt_API_KEY" >&2
		return 1
	fi
	case "$base_url$api_key" in
	*$'\r'* | *$'\n'*)
		echo "OEM model bundle values must not contain newlines" >&2
		return 1
		;;
	esac
	if ! node -e 'const u=new URL(process.argv[1]);if(!["http:","https:"].includes(u.protocol)||!u.hostname)process.exit(1)' "$base_url"; then
		echo "volt_MODEL_BASE_URL must be an absolute HTTP(S) URL" >&2
		return 1
	fi
}

stage_volt_model_bundle() {
	local target="build/windows/installer/bundled.env"
	local base_url="${volt_MODEL_BASE_URL:-}"
	local api_key="${volt_API_KEY:-}"

	rm -f "$target"
	if [ -z "$base_url" ] && [ -z "$api_key" ]; then
		[ "${REQUIRE_volt_MODEL_BUNDLE:-0}" != "1" ] && return 0
		echo "required OEM model bundle is missing volt_MODEL_BASE_URL and volt_API_KEY" >&2
		return 1
	fi
	validate_volt_model_bundle "$base_url" "$api_key"

	echo "==> staging OEM model bundle"
	mkdir -p "$(dirname "$target")"
	(
		umask 077
		{
			echo "# Build-time OEM model gateway settings. User-saved credentials take priority."
			printf 'volt_MODEL_BASE_URL=%s\n' "$base_url"
			printf 'volt_API_KEY=%s\n' "$api_key"
		} > "$target"
	)
}

# Stamp the version resource (Windows file properties, macOS CFBundleVersion) from
# the tag. Wails feeds info.productVersion into goversioninfo and NSIS's
# VIFileVersion, both of which demand a strictly numeric X.X.X, so strip the
# leading "v" AND any prerelease suffix (a `-rc1` tag would otherwise abort the
# installer build). The full tag still rides in ldflags for the in-app version.
numver="${VERSION#v}"; numver="${numver%%-*}"
node -e 'const fs=require("fs"),f="wails.json",j=JSON.parse(fs.readFileSync(f,"utf8"));j.info.productVersion=process.argv[1];fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n")' "$numver"

# NSIS installer is Windows-only (Wails requires a single windows target for -nsis).
ldflags="-X main.version=$VERSION -X main.channel=$CHANNEL $source_revision_ldflag"
[ "$os" = "darwin" ] && [ "${HAS_APPLE_CERT:-}" = "true" ] && ldflags="$ldflags -X main.macSelfUpdate=true"
UPDATE_HELPER="voltui-update-helper.exe"
if [ "$os" = windows ]; then
	stage_volt_model_bundle
	windows_resource_tool_dir=$(mktemp -d)
	windows_resource_tool="$windows_resource_tool_dir/voltui-windows-resource.exe"
	echo "==> build Windows resource stamper"
	go build -trimpath -o "$windows_resource_tool" ./cmd/windows-resource
	guard_out="$ROOT/desktop/build/windows/installer/$GUARDNAME.exe"
	build_guard
	stamp_windows_executable "$guard_out" "VoltUI Guard" "$GUARDNAME" "$GUARDNAME.exe"
	launcher_out="$ROOT/desktop/build/windows/installer/$LAUNCHERNAME.exe"
	echo "==> go build Windows GUI launcher"
	(cd "$ROOT" && GOOS=windows GOARCH="$arch" CGO_ENABLED=0 go build -trimpath \
		-ldflags="-s -w -H windowsgui -X main.version=$VERSION" -o "$launcher_out" ./cmd/reasonix-guard)
	stamp_windows_executable "$launcher_out" "VoltUI Launcher" "$LAUNCHERNAME" "$LAUNCHERNAME.exe"
	echo "==> go build Windows update helper"
	GOOS=windows GOARCH="$arch" go build -trimpath -ldflags="-s -w" \
		-o "build/windows/installer/$UPDATE_HELPER" ./cmd/update-helper
	stamp_windows_executable "build/windows/installer/$UPDATE_HELPER" "VoltUI Update Helper" "voltui-update-helper" "$UPDATE_HELPER"
	cli_out="$ROOT/desktop/build/windows/installer/$WINDOWS_CLINAME.exe"
	build_cli
	stamp_windows_executable "$cli_out" "VoltUI CLI" "$WINDOWS_CLINAME" "$WINDOWS_CLINAME.exe"
	# The first NSIS pass must regenerate this release's uninstaller; a stale
	# preserved file must never enter the signing payload.
	rm -f "build/windows/installer/voltui-uninstall.exe"
fi
build_args=()
[ "${DESKTOP_BUILD_CLEAN:-1}" != "0" ] && build_args+=(-clean)
build_args+=(-platform "$PLATFORM" -ldflags "$ldflags")
[ "$os" = windows ] && build_args+=(-nsis -webview2 embed)
# Link cgo against WebKitGTK 4.1: 4.0 (libwebkit2gtk-4.0.so.37) is gone on
# Ubuntu 24.04+/Fedora 40+, while 4.1 ships from Ubuntu 22.04 onward.
[ "$os" = linux ] && build_args+=(-tags webkit2_41)

echo "==> wails build ${build_args[*]}"
if [ "$os" = windows ]; then
	CGO_ENABLED=0 wails build "${build_args[@]}"
else
	wails build "${build_args[@]}"
fi
if [ "$os" != windows ]; then
	guard_out="$ROOT/desktop/build/bin/$GUARDNAME"
	build_guard
	cli_out="$ROOT/desktop/build/bin/$CLINAME"
	build_cli
fi

mkdir -p "$ROOT/dist"

case "$os" in
darwin)
	# Wails names the bundle after outputfilename (voltui-desktop.app); repackage
	# it as VoltUI.app for a clean user-facing name.
	staging=$(mktemp -d)
	app="$staging/${APPNAME}.app"
	cp -R "build/bin/voltui-desktop.app" "$app"
	cp "$guard_out" "$app/Contents/MacOS/$GUARDNAME"
	cp "$cli_out" "$app/Contents/MacOS/$CLINAME"
	bundle_executable=$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$app/Contents/Info.plist")
	# LaunchServices must own the Wails/AppKit process directly. Making Guard the
	# bundle executable leaves the Dock attached to a non-UI parent process, so
	# clicking the icon cannot reliably reactivate the desktop window. Guard and
	# the CLI remain bundled as independent recovery sidecars.
	[ "$bundle_executable" = "$BINNAME" ] || { echo "macOS bundle executable is $bundle_executable, want $BINNAME" >&2; exit 1; }
	bundle_icon=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIconFile" "$app/Contents/Info.plist")
	case "$bundle_icon" in
	*.icns) ;;
	*) bundle_icon="$bundle_icon.icns" ;;
	esac
	[ -s "$app/Contents/Resources/$bundle_icon" ] || { echo "macOS bundle icon is missing: $bundle_icon" >&2; exit 1; }

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
	if [ "${DESKTOP_BUILD_SKIP_DMG:-0}" = "1" ]; then
		echo "==> skip DMG packaging (DESKTOP_BUILD_SKIP_DMG=1)"
	else
		# A drag-to-Applications .dmg for first-time human download. Named -universal so
		# cmd/sign's substring match (darwin-arm64/darwin-amd64) skips it: the .zip stays
		# the updater channel, the .dmg is release-page only. create-dmg can exit nonzero
		# while still writing the image, so gate on the file existing, not the exit code.
		dmgsrc=$(mktemp -d)
		cp -R "$app" "$dmgsrc/${APPNAME}.app"
		dmg="$ROOT/dist/${APPNAME}-darwin-universal.dmg"
		create-dmg \
			--volname "$APPNAME" \
			--window-size 540 380 \
			--icon-size 110 \
			--icon "${APPNAME}.app" 150 190 \
			--app-drop-link 390 190 \
			--no-internet-enable \
			"$dmg" "$dmgsrc" || true
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
		rm -rf "$dmgsrc"
	fi
	rm -rf "$staging"
	;;
windows)
	# Keep one canonical flat payload for SignPath. The release workflow signs
	# these files, then calls package-windows-desktop.sh again so both the
	# portable archive and the files embedded by NSIS carry Authenticode.
	payload_dir="$ROOT/desktop/build/windows/signing-payload"
	rm -rf -- "$payload_dir"
	mkdir -p "$payload_dir"
	cp "build/bin/$BINNAME.exe" "$payload_dir/$BINNAME.exe"
	cp "build/windows/installer/$UPDATE_HELPER" "$payload_dir/$UPDATE_HELPER"
	cp "$launcher_out" "$payload_dir/$LAUNCHERNAME.exe"
	cp "$guard_out" "$payload_dir/$GUARDNAME.exe"
	cp "build/windows/installer/$WINDOWS_CLINAME.exe" "$payload_dir/$WINDOWS_CLINAME.exe"
	cp "build/windows/installer/voltui-uninstall.exe" "$payload_dir/voltui-uninstall.exe"
	"$ROOT/scripts/package-windows-desktop.sh" "$arch" "$payload_dir"
	;;
linux)
	for desktop_contract in \
		'Exec=voltui-guard launch --detach' \
		'Icon=voltui-desktop' \
		'StartupWMClass=voltui-desktop'; do
		grep -F -x -q "$desktop_contract" build/linux/reasonix.desktop || { echo "Linux desktop entry missing: $desktop_contract" >&2; exit 1; }
	done
	tar -czf "$ROOT/dist/${APPNAME}-linux-${arch}.tar.gz" -C build/bin "$BINNAME" "$GUARDNAME" "$CLINAME"
	# Build the privileged update helper shipped inside the .deb. Portable tarball
	# installs do not need it; only the dpkg package installs helper + Polkit policy.
	echo "==> go build voltui-update-helper"
	GOOS=linux GOARCH="$arch" CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=$VERSION" \
		-o "build/bin/voltui-update-helper" ./cmd/update-helper
	# .deb for Debian/Ubuntu. Portable updater still uses the tarball under
	# platforms[]; .deb is published under native_packages. Debian versions use
	# "~" for prereleases so 1.18.0~rc.1 < 1.18.0 (policy version ordering).
	# Extra "-" inside the prerelease label becomes "." (Debian policy).
	ver_body="${VERSION#v}"
	if [[ "$ver_body" == *-* ]]; then
		deb_base="${ver_body%%-*}"
		deb_pre="${ver_body#*-}"
		deb_pre="${deb_pre//-/.}"
		deb_version="${deb_base}~${deb_pre}"
	else
		deb_version="$ver_body"
	fi
	DEB_VERSION="$deb_version" DEB_ARCH="$arch" \
		nfpm package --config build/linux/nfpm.yaml --packager deb \
		--target "$ROOT/dist/${APPNAME}-linux-${arch}.deb"
	# Contract smoke: helper, policy, package identity, and pkexec dependency.
	deb_path="$ROOT/dist/${APPNAME}-linux-${arch}.deb"
	dpkg-deb --field "$deb_path" Package | grep -x 'voltui-desktop' >/dev/null
	dpkg-deb --field "$deb_path" Version | grep -x "$deb_version" >/dev/null
	dpkg-deb --field "$deb_path" Depends | grep -F 'pkexec' >/dev/null
	dpkg-deb --contents "$deb_path" | grep -E 'usr/lib/reasonix/voltui-update-helper' >/dev/null
	dpkg-deb --contents "$deb_path" | grep -E 'usr/share/polkit-1/actions/io.reasonix.desktop.update.policy' >/dev/null
	;;
*)
	echo "unsupported os: $os" >&2
	exit 1
	;;
esac

echo "==> packaged into dist/:"
ls -la "$ROOT/dist"
