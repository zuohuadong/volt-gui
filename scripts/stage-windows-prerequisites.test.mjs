import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  assetsForTarget,
  renderInstallScript,
  sha256,
  stageWindowsPrerequisites,
  verifyAsset,
} from './stage-windows-prerequisites.mjs';

function writeExecutable(path, source) {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

test('maps Windows architectures to the pinned official prerequisite assets', () => {
  const x64 = assetsForTarget('windows/amd64');
  assert.deepEqual(x64.webview2, {
    name: 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe',
    url: 'https://msedge.sf.dl.delivery.mp.microsoft.com/filestreamingservice/files/6c36e6de-67d8-470e-a071-894d02cd99eb/MicrosoftEdgeWebView2RuntimeInstallerX64.exe',
    sha256: '3a08103bed8a3d9aefdfc9ac10a672ea69605163f2dcb08d76cfd3e0444511c9',
  });
  assert.deepEqual(x64.vcRuntime, {
    name: 'VC_redist.x64.exe',
    url: 'https://download.visualstudio.microsoft.com/download/pr/7ebf5fdb-36dc-4145-b0a0-90d3d5990a61/CC0FF0EB1DC3F5188AE6300FAEF32BF5BEEBA4BDD6E8E445A9184072096B713B/VC_redist.x64.exe',
    sha256: 'cc0ff0eb1dc3f5188ae6300faef32bf5beeba4bdd6e8e445a9184072096b713b',
  });
  assert.deepEqual(assetsForTarget('windows/arm64'), {
    vcRuntime: {
      name: 'VC_redist.arm64.exe',
      url: 'https://download.visualstudio.microsoft.com/download/pr/d7450eb5-03e1-436d-9e7e-deb5fe4759b3/5139E1440C3A20B92153A4DB561C069A0175AAF76C276C3E5B6F56099EDCF4B0/VC_redist.arm64.exe',
      sha256: '5139e1440c3a20b92153a4db561c069a0175aaf76c276c3e5b6f56099edcf4b0',
    },
    webview2: {
      name: 'MicrosoftEdgeWebView2RuntimeInstallerARM64.exe',
      url: 'https://msedge.sf.dl.delivery.mp.microsoft.com/filestreamingservice/files/e957fa76-a5bf-402d-b45d-4e42529bc4a4/MicrosoftEdgeWebView2RuntimeInstallerARM64.exe',
      sha256: '39c7802ca48d340b54057451d68a129af982395220b6b17da6e1ee6c4fdde16e',
    },
  });
  assert.throws(() => assetsForTarget('linux/amd64'), /unsupported Windows prerequisites target/);
});

test('verifies downloaded prerequisite bytes against pinned SHA-256', () => {
  const data = Buffer.from('voltui-prerequisite');
  verifyAsset(data, sha256(data), 'fixture.exe');
  assert.throws(() => verifyAsset(data, '0'.repeat(64), 'fixture.exe'), /SHA-256 mismatch/);
});

test('installer script elevates and installs VC++ before WebView2 with explicit exit handling', () => {
  const script = renderInstallScript(assetsForTarget('windows/amd64'));
  assert.match(script, /Start-Process.+-Verb RunAs.+-Wait.+-PassThru/);
  assert.ok(script.indexOf('VC_redist.x64.exe') < script.indexOf('MicrosoftEdgeWebView2RuntimeInstallerX64.exe'));
  assert.match(script, /3010/);
  assert.match(script, /1641/);
  assert.match(script, /1638/);
  assert.match(script, /-2147023258/);
  assert.match(script, /-2147219198/);
  assert.equal((script.match(/if not "%VOLTUI_EXIT_CODE%"=="0" goto failed/g) ?? []).length, 2);
  assert.doesNotMatch(script, /if errorlevel 1 goto failed/);
  assert.match(script, /exit \/b %VOLTUI_EXIT_CODE%/);
});

test('stages a deterministic offline prerequisite directory from injected local assets', async () => {
  const root = join(tmpdir(), `voltui-prerequisites-test-${process.pid}-${Date.now()}`);
  const cache = join(root, 'cache');
  const out = join(root, 'out');
  const vc = Buffer.from('vc-fixture');
  const webview2 = Buffer.from('webview2-fixture');
  const assets = {
    vcRuntime: { name: 'VC_redist.x64.exe', url: 'https://example.invalid/vc', sha256: sha256(vc) },
    webview2: { name: 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe', url: 'https://example.invalid/webview2', sha256: sha256(webview2) },
  };
  try {
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, assets.vcRuntime.name), vc);
    writeFileSync(join(cache, assets.webview2.name), webview2);
    await stageWindowsPrerequisites(out, 'windows/amd64', { assets, cacheDir: cache });

    assert.equal(readFileSync(join(out, assets.vcRuntime.name), 'utf8'), 'vc-fixture');
    assert.equal(readFileSync(join(out, assets.webview2.name), 'utf8'), 'webview2-fixture');
    const metadata = JSON.parse(readFileSync(join(out, 'metadata.json'), 'utf8'));
    assert.deepEqual(metadata.installOrder, ['vcRuntime', 'webview2']);
    assert.match(readFileSync(join(out, 'README.txt'), 'utf8'), /先安装此 prerequisites 包，再运行同一个 VoltUI 在线安装包/);
    assert.match(readFileSync(join(out, 'SHA256SUMS.txt'), 'utf8'), new RegExp(`${sha256(vc)}  VC_redist\\.x64\\.exe`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('packages Windows prerequisites with zip when Windows shell tools are unavailable', {
  skip: process.platform === 'win32',
}, () => {
  const fixture = join(tmpdir(), `voltui-prerequisites-package-${process.pid}-${Date.now()}`);
  const bin = join(fixture, 'bin');
  const script = join(fixture, 'scripts', 'desktop-build.sh');
  const zipCapture = join(fixture, 'zip-calls.txt');

  try {
    mkdirSync(join(fixture, 'desktop'), { recursive: true });
    mkdirSync(join(fixture, 'scripts'), { recursive: true });
    mkdirSync(bin, { recursive: true });
    copyFileSync(new URL('./desktop-build.sh', import.meta.url), script);
    chmodSync(script, 0o755);
    writeFileSync(join(fixture, 'desktop', 'wails.json'), '{}\n');

    writeExecutable(join(bin, 'node'), String.raw`#!/usr/bin/env bash
case "$1" in
  */stage-computer-use-mcp.mjs)
    mkdir -p "$2"
    printf 'server\n' > "$2/server.js"
    ;;
  */stage-bun-runtime.mjs)
    mkdir -p "$2"
    printf 'bun\n' > "$2/bun.exe"
    ;;
  */stage-coreutils.mjs)
    mkdir -p "$2"
    printf 'coreutils\n' > "$2/voltui-coreutils-path.txt"
    printf 'installer\n' > "$2/coreutils-system-installer.exe"
    ;;
  */stage-windows-prerequisites.mjs)
    mkdir -p "$2"
    printf 'vc\n' > "$2/VC_redist.x64.exe"
    printf 'webview2\n' > "$2/MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
    printf '{}\n' > "$2/metadata.json"
    ;;
esac
`);
    writeExecutable(join(bin, 'go'), String.raw`#!/usr/bin/env bash
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then
    mkdir -p "$(dirname "$2")"
    : > "$2"
    exit 0
  fi
  shift
done
`);
    writeExecutable(join(bin, 'wails'), String.raw`#!/usr/bin/env bash
mkdir -p build/bin
: > build/bin/voltui-desktop-amd64-installer.exe
: > build/bin/voltui-desktop.exe
`);
    writeExecutable(join(bin, 'zip'), String.raw`#!/usr/bin/env bash
printf 'cwd=%s\nargs=%s\n' "$PWD" "$*" >> "$ZIP_CAPTURE"
case "$PWD" in
  */prerequisites)
    [ -f VC_redist.x64.exe ]
    [ -f MicrosoftEdgeWebView2RuntimeInstallerX64.exe ]
    [ -f metadata.json ]
    ;;
esac
mkdir -p "$(dirname "$3")"
: > "$3"
`);

    const env = {
      ...process.env,
      PATH: `${bin}:/usr/bin:/bin`,
      DESKTOP_APP_NAME: 'VoltUI',
      ZIP_CAPTURE: zipCapture,
    };
    const result = spawnSync(script, ['windows/amd64', 'v1.2.3'], {
      cwd: fixture,
      env,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const zipCalls = readFileSync(zipCapture, 'utf8');
    assert.match(zipCalls, /cwd=.*\/prerequisites/);
    assert.match(zipCalls, /args=-q -r .*\/dist\/VoltUI-windows-amd64-prerequisites\.zip \./);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('Windows packaging publishes prerequisites separately while keeping the online installer', () => {
  const buildScript = readFileSync(new URL('./desktop-build.sh', import.meta.url), 'utf8');
  const installer = readFileSync(new URL('../desktop/build/windows/installer/project.nsi', import.meta.url), 'utf8');
  const desktopCI = readFileSync(new URL('../.github/workflows/desktop-ci.yml', import.meta.url), 'utf8');
  const cnb = readFileSync(new URL('../.cnb.yml', import.meta.url), 'utf8');
  const prerequisitesBlock = buildScript.slice(
    buildScript.indexOf('prerequisites_zip='),
    buildScript.indexOf('\n\t;;', buildScript.indexOf('prerequisites_zip=')),
  );

  assert.match(buildScript, /-nsis -webview2 embed/);
  assert.match(buildScript, /\$\{APPNAME\}-windows-\$\{arch\}-prerequisites\.zip/);
  assert.match(prerequisitesBlock, /command -v cygpath/);
  assert.match(prerequisitesBlock, /command -v powershell\.exe/);
  assert.match(prerequisitesBlock, /cygpath -w "\$prerequisites_zip"/);
  assert.match(prerequisitesBlock, /cd "\$WINDOWS_PREREQUISITES_RESOURCE"/);
  assert.match(prerequisitesBlock, /zip -q -r "\$prerequisites_zip" \./);
  assert.match(installer, /ReadRegStr \$0 HKLM.+EdgeUpdate.+"pv"/);
  assert.match(installer, /VoltUI-windows-\$\{ARCH\}-prerequisites\.zip/);
  assert.match(desktopCI, /stage-windows-prerequisites\.test\.mjs/);
  assert.match(cnb, /apt-get install -y[\s\S]*\bzip\b/);
  assert.match(cnb, /scripts\/desktop-build\.sh windows\/amd64 "\$VERSION"/);
});
