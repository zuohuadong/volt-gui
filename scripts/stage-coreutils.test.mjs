import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { assetsForTarget, isSafeRelativePath, runtimePathInTree, sha256, verifyAsset } from './stage-coreutils.mjs';

test('maps Windows build architectures to matching immutable release assets', () => {
  assert.match(assetsForTarget('windows/amd64').archive.name, /-x64\.zip$/);
  assert.match(assetsForTarget('windows/arm64').archive.name, /-arm64\.zip$/);
  assert.throws(() => assetsForTarget('linux/amd64'), /unsupported Coreutils target/);
});

test('verifies bytes against the pinned SHA-256', () => {
  const data = Buffer.from('voltui-coreutils');
  verifyAsset(data, sha256(data), 'fixture');
  assert.throws(() => verifyAsset(data, '0'.repeat(64), 'fixture'), /SHA-256 mismatch/);
});

test('discovers the command directory without trusting a fixed ZIP layout', () => {
  const root = join(tmpdir(), `voltui-coreutils-test-${process.pid}-${Date.now()}`);
  try {
    const bin = join(root, 'nested', 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'coreutils.exe'), 'fixture');
    assert.equal(runtimePathInTree(root), 'nested/bin');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('accepts an archive whose command dispatchers are at its root', () => {
  const root = join(tmpdir(), 'voltui-coreutils-root-test-' + process.pid + '-' + Date.now());
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'coreutils.exe'), 'fixture');
    assert.equal(runtimePathInTree(root), '.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects unsafe runtime metadata paths', () => {
  for (const path of ['', '..', '../bin', '/bin', '\\server\\share', 'C:\\bin', 'bin/../other']) {
    assert.equal(isSafeRelativePath(path), false, path);
  }
  assert.equal(isSafeRelativePath('.'), true);
  assert.equal(isSafeRelativePath('bin'), true);
  assert.equal(isSafeRelativePath('nested/bin'), true);
});
