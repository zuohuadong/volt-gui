import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptsDir);

function writeExecutable(path, source) {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

function writeRuntimeResources(installerDir) {
  const mcpServer = join(installerDir, 'computer-use-mcp', 'node_modules', '@zavora-ai', 'computer-use-mcp', 'dist', 'server.js');
  mkdirSync(dirname(mcpServer), { recursive: true });
  writeFileSync(mcpServer, 'server');
  const bun = join(installerDir, 'computer-use-runtime', 'bun-windows-amd64', 'bin', 'bun.exe');
  mkdirSync(dirname(bun), { recursive: true });
  writeFileSync(bun, 'bun');
  const coreutils = join(installerDir, 'coreutils');
  mkdirSync(coreutils, { recursive: true });
  writeFileSync(join(coreutils, 'voltui-coreutils-path.txt'), 'bin\n');
  writeFileSync(join(coreutils, 'coreutils-system-installer.exe'), 'installer');
}

function copyPackagingScripts(root) {
  const fixtureScripts = join(root, 'scripts');
  mkdirSync(fixtureScripts, { recursive: true });
  for (const name of ['package-windows-desktop.sh', 'verify-windows-portable.sh']) {
    const destination = join(fixtureScripts, name);
    copyFileSync(join(scriptsDir, name), destination);
    chmodSync(destination, 0o755);
  }
}

function writePackagingInputs(root, installer, payload, commands) {
  for (const name of ['voltui-desktop.exe', 'voltui-update-helper.exe', 'voltui-cli.exe']) {
    writeFileSync(join(payload, name), name);
  }
  writeFileSync(join(installer, 'wails_tools.nsh'), 'tools');
  writeFileSync(join(installer, 'tmp', 'MicrosoftEdgeWebview2Setup.exe'), 'webview');
  writeFileSync(join(installer, 'project.nsi'), 'project');
  writeRuntimeResources(installer);
  writeExecutable(join(commands, 'makensis'), '#!/usr/bin/env bash\nmkdir -p ../../bin\nprintf installer > ../../bin/voltui-desktop-amd64-installer.exe\n');
}

function createPackagingFixture() {
  const root = mkdtempSync(join(tmpdir(), 'voltui-windows-package-'));
  const installer = join(root, 'desktop', 'build', 'windows', 'installer');
  const payload = join(root, 'payload');
  const commands = join(root, 'commands');
  mkdirSync(join(installer, 'tmp'), { recursive: true });
  mkdirSync(join(root, 'desktop', 'build', 'bin'), { recursive: true });
  mkdirSync(payload, { recursive: true });
  mkdirSync(commands, { recursive: true });
  copyPackagingScripts(root);
  writePackagingInputs(root, installer, payload, commands);
  return { root, payload, commands };
}

function assertPackagingOutputs(root) {
  const installer = join(root, 'dist', 'VoltUI-windows-amd64-installer.exe');
  const portable = join(root, 'dist', 'VoltUI-windows-amd64.zip');
  assert.equal(existsSync(installer), true);
  assert.equal(existsSync(portable), true);
  const entries = execFileSync('unzip', ['-Z1', portable], { encoding: 'utf8' });
  assert.match(entries, /voltui-desktop\.exe/);
  assert.match(entries, /computer-use-mcp\/node_modules\/@zavora-ai\/computer-use-mcp\/dist\/server\.js/);
  assert.match(entries, /coreutils\/coreutils-system-installer\.exe/);
  assert.deepEqual(readdirSync(join(root, 'desktop', 'build', 'windows', 'installer-signing-bundle')).sort(), [
    'VoltUI-windows-amd64-installer.exe',
    'voltui-cli.exe',
    'voltui-desktop.exe',
    'voltui-update-helper.exe',
  ]);
}

function signPathEntries(relativePath) {
  const source = readFileSync(join(repoRoot, relativePath), 'utf8');
  return [...source.matchAll(/<pe-file path="([^"]+)">/g)].map((match) => match[1]);
}

test('rebuilds the current Windows installer and portable runtime layout', () => {
  const fixture = createPackagingFixture();
  try {
    const packaging = spawnSync(join(fixture.root, 'scripts', 'package-windows-desktop.sh'), ['amd64', fixture.payload], {
      env: { ...process.env, PATH: `${fixture.commands}:${process.env.PATH}`, DESKTOP_APP_NAME: 'VoltUI' },
      encoding: 'utf8',
    });
    assert.equal(packaging.status, 0, packaging.stderr || packaging.stdout);
    assertPackagingOutputs(fixture.root);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('keeps SignPath and release verification aligned with the signed payload', () => {
  const signedPayload = ['voltui-desktop.exe', 'voltui-update-helper.exe', 'voltui-cli.exe'];
  assert.deepEqual(signPathEntries('.signpath/artifact-configurations/windows-payload.xml'), signedPayload);
  assert.deepEqual(signPathEntries('.signpath/artifact-configurations/windows-installer-v2.xml'), [
    '*installer*.exe',
    ...signedPayload,
  ]);
  const verifierSource = readFileSync(join(scriptsDir, 'verify-windows-authenticode.ps1'), 'utf8');
  for (const name of signedPayload) {
    assert.match(verifierSource, new RegExp(name.replaceAll('.', '\\.')));
  }
  assert.doesNotMatch(verifierSource, /reasonix-(desktop|guard|launcher|update-helper|cli|uninstall)\.exe/i);
  const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'release-desktop.yml'), 'utf8');
  assert.match(workflow, /dist\/VoltUI-windows-\$arch-installer\.exe/);
  assert.match(workflow, /dist\/VoltUI-windows-\$arch\.zip/);
});
