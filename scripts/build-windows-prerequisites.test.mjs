import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const buildScript = new URL('./build-windows-prerequisites.sh', import.meta.url);

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function fixture() {
  const root = join(tmpdir(), `windows-prerequisites-build-${process.pid}-${Date.now()}`);
  const versionFile = join(root, 'version.txt');
  const stageScript = join(root, 'stage.mjs');
  const dist = join(root, 'dist-prerequisites');
  mkdirSync(root, { recursive: true });
  writeFileSync(versionFile, 'v1.0.0\n');
  writeFileSync(stageScript, String.raw`
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [out, target] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'VC_redist.x64.exe'), 'vc-fixture');
writeFileSync(join(out, 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe'), 'webview-fixture');
writeFileSync(join(out, 'install-prerequisites.cmd'), '@echo off\r\n');
writeFileSync(join(out, 'README.txt'), 'fixture\r\n');
writeFileSync(join(out, 'SHA256SUMS.txt'), 'fixture\r\n');
writeFileSync(join(out, 'metadata.json'), JSON.stringify({
  schemaVersion: 2,
  target,
  assets: {
    vcRuntime: { name: 'VC_redist.x64.exe', url: 'https://example.invalid/vc', sha256: 'a'.repeat(64) },
    webview2: { name: 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe', url: 'https://example.invalid/webview', sha256: 'b'.repeat(64) },
  },
}) + '\n');
`);
  return { root, versionFile, stageScript, dist };
}

test('builds an exact independently versioned prerequisites release asset set', {
  skip: process.platform === 'win32',
}, () => {
  const f = fixture();
  try {
    const env = {
      ...process.env,
      DESKTOP_APP_NAME: 'Anyong',
      VOLTUI_BRAND_NAME: '西谷智灯暗涌系统',
      PREREQUISITES_VERSION_FILE: f.versionFile,
      PREREQUISITES_STAGE_SCRIPT: f.stageScript,
      PREREQUISITES_DIST_DIR: f.dist,
      PREREQUISITES_RELEASE_TAG: 'prerequisites-v1.0.0',
      PREREQUISITES_REPO_URL: 'https://cnb.cool/example/repo',
    };
    let result = spawnSync(buildScript.pathname, ['windows/amd64'], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const zipName = 'Anyong-windows-amd64-prerequisites-v1.0.0.zip';
    const manifestName = 'Anyong-windows-amd64-prerequisites-v1.0.0.json';
    assert.deepEqual(readdirSync(f.dist).sort(), [manifestName, zipName, `${zipName}.sha256`].sort());

    const zip = readFileSync(join(f.dist, zipName));
    const digest = sha256(zip);
    assert.equal(readFileSync(join(f.dist, `${zipName}.sha256`), 'utf8'), `${digest}  ${zipName}\n`);

    const manifest = JSON.parse(readFileSync(join(f.dist, manifestName), 'utf8'));
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.bundleVersion, 'v1.0.0');
    assert.equal(manifest.releaseTag, 'prerequisites-v1.0.0');
    assert.equal(manifest.target, 'windows/amd64');
    assert.equal(manifest.filename, zipName);
    assert.equal(manifest.size, zip.length);
    assert.equal(manifest.sha256, digest);
    assert.equal(
      manifest.downloadURL,
      `https://cnb.cool/example/repo/-/releases/download/prerequisites-v1.0.0/${zipName}`,
    );
    assert.equal(manifest.sourceAssets.vcRuntime.sha256, 'a'.repeat(64));

    const listing = spawnSync('unzip', ['-Z1', join(f.dist, zipName)], { encoding: 'utf8' });
    assert.equal(listing.status, 0, listing.stderr);
    for (const name of [
      'VC_redist.x64.exe',
      'MicrosoftEdgeWebView2RuntimeInstallerX64.exe',
      'install-prerequisites.cmd',
      'README.txt',
      'SHA256SUMS.txt',
      'metadata.json',
    ]) {
      assert.match(listing.stdout, new RegExp(`^${name.replaceAll('.', '\\.')}\\n`, 'm'));
    }

    writeFileSync(join(f.dist, 'unexpected.txt'), 'stale');
    result = spawnSync(buildScript.pathname, ['windows/amd64'], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(readdirSync(f.dist).sort(), [manifestName, zipName, `${zipName}.sha256`].sort());
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('fails closed when the release tag does not match the version file', {
  skip: process.platform === 'win32',
}, () => {
  const f = fixture();
  try {
    const result = spawnSync(buildScript.pathname, ['windows/amd64'], {
      env: {
        ...process.env,
        PREREQUISITES_VERSION_FILE: f.versionFile,
        PREREQUISITES_STAGE_SCRIPT: f.stageScript,
        PREREQUISITES_DIST_DIR: f.dist,
        PREREQUISITES_RELEASE_TAG: 'prerequisites-v1.0.1',
      },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /tag mismatch: got prerequisites-v1\.0\.1, want prerequisites-v1\.0\.0/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
