import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const verifier = join(dirname(fileURLToPath(import.meta.url)), 'verify-windows-portable.sh');

function createPortableFixture() {
  const root = mkdtempSync(join(tmpdir(), 'voltui-portable-'));
  for (const name of ['voltui-desktop.exe', 'voltui-update-helper.exe', 'voltui-cli.exe']) {
    writeFileSync(join(root, name), name);
  }
  const mcpServer = join(root, 'computer-use-mcp', 'node_modules', '@zavora-ai', 'computer-use-mcp', 'dist', 'server.js');
  mkdirSync(dirname(mcpServer), { recursive: true });
  writeFileSync(mcpServer, 'server');
  const bun = join(root, 'computer-use-runtime', 'bun-windows-amd64', 'bin', 'bun.exe');
  mkdirSync(dirname(bun), { recursive: true });
  writeFileSync(bun, 'bun');
  chmodSync(bun, 0o755);
  const coreutils = join(root, 'coreutils');
  mkdirSync(coreutils, { recursive: true });
  writeFileSync(join(coreutils, 'voltui-coreutils-path.txt'), 'bin\n');
  writeFileSync(join(coreutils, 'coreutils-system-installer.exe'), 'installer');
  return root;
}

function verifyFixture(root) {
  return spawnSync('bash', [verifier, root], { encoding: 'utf8' });
}

test('accepts the current VoltUI executable and runtime layout', () => {
  const root = createPortableFixture();
  try {
    const verification = verifyFixture(root);
    assert.equal(verification.status, 0, verification.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects an executable from the removed Guard layout', () => {
  const root = createPortableFixture();
  try {
    writeFileSync(join(root, 'reasonix-guard.exe'), 'legacy');
    const verification = verifyFixture(root);
    assert.notEqual(verification.status, 0);
    assert.match(verification.stderr, /entry is unexpected: reasonix-guard\.exe/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a portable package without the required CLI sidecar', () => {
  const root = createPortableFixture();
  try {
    rmSync(join(root, 'voltui-cli.exe'));
    const verification = verifyFixture(root);
    assert.notEqual(verification.status, 0);
    assert.match(verification.stderr, /entry is missing or has wrong case: voltui-cli\.exe/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a portable package without the pinned Coreutils installer', () => {
  const root = createPortableFixture();
  try {
    rmSync(join(root, 'coreutils', 'coreutils-system-installer.exe'));
    const verification = verifyFixture(root);
    assert.notEqual(verification.status, 0);
    assert.match(verification.stderr, /Coreutils installer is missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
