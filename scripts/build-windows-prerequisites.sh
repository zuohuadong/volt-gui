#!/usr/bin/env bash
# Build the independently versioned Windows prerequisite bundle.
#
# Usage: scripts/build-windows-prerequisites.sh [windows/amd64]
#
# Forks configure artifact and display branding through DESKTOP_APP_NAME and
# VOLTUI_BRAND_NAME. CNB tag builds additionally provide CNB_REPO_URL_HTTPS.
set -euo pipefail

PLATFORM="${1:-windows/amd64}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION_FILE="${PREREQUISITES_VERSION_FILE:-$ROOT/desktop/prerequisites-version.txt}"
STAGE_SCRIPT="${PREREQUISITES_STAGE_SCRIPT:-$ROOT/scripts/stage-windows-prerequisites.mjs}"
DIST_DIR="${PREREQUISITES_DIST_DIR:-$ROOT/dist-prerequisites}"
APPNAME="${DESKTOP_APP_NAME:-VoltUI}"
PRODUCT_NAME="${VOLTUI_BRAND_NAME:-VoltUI}"

[ -f "$VERSION_FILE" ] || { echo "missing prerequisites version file: $VERSION_FILE" >&2; exit 1; }
VERSION="$(tr -d '\r\n' < "$VERSION_FILE")"
echo "$VERSION" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$' || {
	echo "invalid prerequisites version: $VERSION" >&2
	exit 1
}

EXPECTED_TAG="prerequisites-${VERSION}"
RELEASE_TAG="${PREREQUISITES_RELEASE_TAG:-$EXPECTED_TAG}"
[ "$RELEASE_TAG" = "$EXPECTED_TAG" ] || {
	echo "prerequisites tag mismatch: got $RELEASE_TAG, want $EXPECTED_TAG" >&2
	exit 1
}

case "$PLATFORM" in
windows/amd64|windows/x64) ARCH="amd64" ;;
windows/arm64) ARCH="arm64" ;;
*)
	echo "unsupported prerequisites target: $PLATFORM" >&2
	exit 1
	;;
esac

command -v node >/dev/null 2>&1 || { echo "node is required" >&2; exit 1; }
command -v zip >/dev/null 2>&1 || { echo "zip is required" >&2; exit 1; }

ASSET_NAME="${APPNAME}-windows-${ARCH}-prerequisites-${VERSION}.zip"
REPO_BASE="${PREREQUISITES_REPO_URL:-${CNB_REPO_URL_HTTPS:-}}"
REPO_BASE="${REPO_BASE%/}"
RELEASE_URL=""
if [ -n "$REPO_BASE" ]; then
	RELEASE_URL="${REPO_BASE}/-/releases/download/${RELEASE_TAG}/${ASSET_NAME}"
fi

TMP_DIR="$(mktemp -d)"
STAGE_DIR="$TMP_DIR/prerequisites"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "==> stage ${PRODUCT_NAME} Windows prerequisites ${VERSION} (${PLATFORM})"
VOLTUI_BRAND_NAME="$PRODUCT_NAME" \
PREREQUISITES_BUNDLE_VERSION="$VERSION" \
PREREQUISITES_RELEASE_TAG="$RELEASE_TAG" \
PREREQUISITES_ARTIFACT_NAME="$ASSET_NAME" \
PREREQUISITES_RELEASE_URL="$RELEASE_URL" \
	node "$STAGE_SCRIPT" "$STAGE_DIR" "$PLATFORM"

# Normalize timestamps and entry ordering so the same pinned inputs produce the
# same ZIP bytes across Linux/macOS builders.
find "$STAGE_DIR" -type f -exec touch -t 202001010000 {} +
ZIP_PATH="$DIST_DIR/$ASSET_NAME"
(
	cd "$STAGE_DIR"
	find . -type f -print | LC_ALL=C sort | zip -q -X "$ZIP_PATH" -@
)

CHECKSUM_PATH="$ZIP_PATH.sha256"
MANIFEST_PATH="$DIST_DIR/${ASSET_NAME%.zip}.json"
node --input-type=module - \
	"$ZIP_PATH" "$CHECKSUM_PATH" "$MANIFEST_PATH" "$STAGE_DIR/metadata.json" \
	"$VERSION" "$RELEASE_TAG" "$PLATFORM" "$RELEASE_URL" <<'NODE'
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { readFileSync, statSync, writeFileSync } from 'node:fs';

const [zipPath, checksumPath, manifestPath, innerMetadataPath, version, releaseTag, target, downloadURL] = process.argv.slice(2);
const data = readFileSync(zipPath);
const digest = createHash('sha256').update(data).digest('hex');
const filename = basename(zipPath);
const inner = JSON.parse(readFileSync(innerMetadataPath, 'utf8'));

writeFileSync(checksumPath, `${digest}  ${filename}\n`);
writeFileSync(manifestPath, JSON.stringify({
  schemaVersion: 1,
  bundleVersion: version,
  releaseTag,
  target,
  filename,
  size: statSync(zipPath).size,
  sha256: digest,
  downloadURL,
  sourceAssets: inner.assets,
}, null, 2) + '\n');
NODE

echo "==> prerequisites release assets"
find "$DIST_DIR" -maxdepth 1 -type f -print | LC_ALL=C sort
