import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assetsForTarget,
  renderInstallScript,
  sha256,
  stageWindowsPrerequisites,
  verifyAsset,
} from './stage-windows-prerequisites.mjs';

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

test('Windows packaging publishes prerequisites separately while keeping the online installer', () => {
  const buildScript = readFileSync(new URL('./desktop-build.sh', import.meta.url), 'utf8');
  const installer = readFileSync(new URL('../desktop/build/windows/installer/project.nsi', import.meta.url), 'utf8');
  const desktopCI = readFileSync(new URL('../.github/workflows/desktop-ci.yml', import.meta.url), 'utf8');
  const release = readFileSync(new URL('../.github/workflows/release-desktop.yml', import.meta.url), 'utf8');

  assert.match(buildScript, /-nsis -webview2 embed/);
  assert.match(buildScript, /\$\{APPNAME\}-windows-\$\{arch\}-prerequisites\.zip/);
  assert.match(installer, /ReadRegStr \$0 HKLM.+EdgeUpdate.+"pv"/);
  assert.match(installer, /VoltUI-windows-\$\{ARCH\}-prerequisites\.zip/);
  assert.match(desktopCI, /stage-windows-prerequisites\.test\.mjs/);
  assert.match(release, /stage-windows-prerequisites\.test\.mjs/);
});
