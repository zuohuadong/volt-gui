#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// This is intentionally a reviewed, immutable release rather than "latest":
// Windows customer packages must remain reproducible even when GitHub changes.
export const COREUTILS_VERSION = '2026.6.16';
const REPOSITORY = 'https://github.com/microsoft/coreutils';
const DOWNLOAD_ROOT = `${REPOSITORY}/releases/download/v${COREUTILS_VERSION}`;
const runtimePathFile = 'voltui-coreutils-path.txt';
const systemInstallerFile = 'coreutils-system-installer.exe';

const releaseAssets = Object.freeze({
  x64: Object.freeze({
    archive: asset('coreutils-2026.6.16-x64.zip', 'e2aedf8daa82f1dfb2b86ae7056a6346c21832e0800b718b820369247ce40eba'),
    installer: asset('coreutils-2026.6.16-x64.exe', 'f862b1aa433310420ae20f9b1384f3f974a26ba98ae37ac548061116a3ef6c62'),
  }),
  arm64: Object.freeze({
    archive: asset('coreutils-2026.6.16-arm64.zip', '515c9421341160c11be696bb551bab8f6c050eb3918bacbc276392c003b40ff8'),
    installer: asset('coreutils-2026.6.16-arm64.exe', '45a1b07f5416fa7fef175e12218686eabb3192cdba75e719a4d6f5b37c7bcab3'),
  }),
});

function asset(name, sha256) {
  return Object.freeze({ name, sha256, url: `${DOWNLOAD_ROOT}/${name}` });
}

export function assetsForTarget(target) {
  switch (target) {
    case 'windows/amd64':
    case 'windows/x64':
      return releaseAssets.x64;
    case 'windows/arm64':
      return releaseAssets.arm64;
    default:
      throw new Error(`unsupported Coreutils target: ${target}; expected windows/amd64 or windows/arm64`);
  }
}

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function verifyAsset(data, expected, label) {
  const actual = sha256(data);
  if (actual !== expected.toLowerCase()) {
    throw new Error(`${label} SHA-256 mismatch: got ${actual}, want ${expected}`);
  }
}

// Return a path relative to root which contains the actual command dispatchers.
// Upstream has changed ZIP layout before, so discovery is deliberately based on
// executable markers rather than assuming a particular top-level directory.
export function runtimePathInTree(root) {
  const matches = [];
  visitDirectories(root, (dir, entries) => {
    const names = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name.toLowerCase()));
    if (['coreutils.exe', 'ls.exe', 'grep.exe', 'find.exe'].some((name) => names.has(name))) {
      matches.push(dir);
    }
  });
  matches.sort((a, b) => a.localeCompare(b));
  if (matches.length === 0) {
    throw new Error(`Coreutils archive did not contain a command executable under ${root}`);
  }
  const path = relative(root, matches[0]).split(sep).join('/') || '.';
  if (!isSafeRelativePath(path)) {
    throw new Error(`invalid Coreutils runtime path discovered: ${path}`);
  }
  return path;
}

export function isSafeRelativePath(path) {
  if (path === '.') {
    return true;
  }
  if (!path || path.includes('\0') || isAbsolute(path) || path.startsWith('/') || path.startsWith('\\')) {
    return false;
  }
  // path.isAbsolute on non-Windows hosts does not recognise a Windows drive.
  if (/^[a-zA-Z]:[\\/]/.test(path)) {
    return false;
  }
  const pieces = path.replaceAll('\\', '/').split('/');
  return pieces.every((piece) => piece !== '' && piece !== '.' && piece !== '..');
}

function visitDirectories(root, visit) {
  const entries = readdirSync(root, { withFileTypes: true });
  visit(root, entries);
  for (const entry of entries) {
    if (entry.isDirectory()) {
      visitDirectories(join(root, entry.name), visit);
    }
  }
}

async function readVerifiedAsset(spec) {
  const cacheDir = process.env.VOLTUI_COREUTILS_ASSET_DIR;
  let data;
  let source;
  if (cacheDir) {
    const path = resolve(cacheDir, spec.name);
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new Error(`VOLTUI_COREUTILS_ASSET_DIR does not contain ${spec.name}: ${path}`);
    }
    data = readFileSync(path);
    source = path;
  } else {
    const response = await fetch(spec.url, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`download ${spec.url}: HTTP ${response.status}`);
    }
    data = Buffer.from(await response.arrayBuffer());
    source = spec.url;
  }
  verifyAsset(data, spec.sha256, spec.name);
  return { data, source };
}

function extractZip(zipPath, destination) {
  if (process.platform === 'win32') {
    const quote = (value) => `'${value.replaceAll("'", "''")}'`;
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath ${quote(zipPath)} -DestinationPath ${quote(destination)} -Force`,
    ], { stdio: 'inherit' });
    return;
  }
  execFileSync('unzip', ['-q', zipPath, '-d', destination], { stdio: 'inherit' });
}

function copyArchiveContents(source, destination) {
  for (const entry of readdirSync(source)) {
    cpSync(join(source, entry), join(destination, entry), { recursive: true });
  }
}

function packageReadme(target, assets, runtimePath) {
  return [
    `Microsoft Coreutils for Windows ${COREUTILS_VERSION} is bundled with VoltUI for ${target}.`,
    '',
    'VoltUI adds the private runtime directory below to command child processes only.',
    'It does not change the machine or user PATH, and it does not edit PowerShell profiles.',
    `Runtime directory (relative): ${runtimePath}`,
    '',
    'For system-wide CMD/PowerShell integration in an offline customer network,',
    `an unmodified official installer is included as ${systemInstallerFile}.`,
    'An administrator must launch it explicitly; VoltUI never launches it during install or update.',
    '',
    `Source: ${REPOSITORY}`,
    `ZIP: ${assets.archive.name}`,
    `ZIP SHA-256: ${assets.archive.sha256}`,
    `Installer: ${assets.installer.name}`,
    `Installer SHA-256: ${assets.installer.sha256}`,
    'License: MIT, see LICENSE.txt.',
    '',
  ].join('\n');
}

export async function stageCoreutils(outDir, target) {
  const assets = assetsForTarget(target);
  const temp = mkdtempSync(join(tmpdir(), 'voltui-coreutils-'));
  try {
    const [archive, installer] = await Promise.all([
      readVerifiedAsset(assets.archive),
      readVerifiedAsset(assets.installer),
    ]);
    const archivePath = join(temp, assets.archive.name);
    const extracted = join(temp, 'extracted');
    writeFileSync(archivePath, archive.data);
    mkdirSync(extracted, { recursive: true });
    extractZip(archivePath, extracted);
    const runtimePath = runtimePathInTree(extracted);

    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    copyArchiveContents(extracted, outDir);
    writeFileSync(join(outDir, runtimePathFile), `${runtimePath}\n`);
    writeFileSync(join(outDir, systemInstallerFile), installer.data, { mode: 0o755 });
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    cpSync(join(repoRoot, 'third_party', 'coreutils', 'LICENSE'), join(outDir, 'LICENSE.txt'));
    writeFileSync(join(outDir, 'README.txt'), packageReadme(target, assets, runtimePath));
    writeFileSync(join(outDir, 'metadata.json'), JSON.stringify({
      version: COREUTILS_VERSION,
      target,
      runtimePath,
      repository: REPOSITORY,
      assets,
      sources: { archive: archive.source, installer: installer.source },
    }, null, 2) + '\n');

    // Final checks fail closed if copying or archive discovery ever regresses.
    const stagedRuntime = join(outDir, ...runtimePath.split('/'));
    if (!existsSync(stagedRuntime) || !lstatSync(stagedRuntime).isDirectory()) {
      throw new Error(`staged Coreutils runtime is missing: ${stagedRuntime}`);
    }
    if (!existsSync(join(outDir, systemInstallerFile))) {
      throw new Error(`staged system installer is missing: ${systemInstallerFile}`);
    }
    console.log(`staged Microsoft Coreutils ${COREUTILS_VERSION} for ${target} at ${outDir}`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const [outDir, target] = process.argv.slice(2);
  if (!outDir || !target) {
    console.error('usage: stage-coreutils.mjs <out-dir> <windows/arch>');
    process.exitCode = 2;
  } else {
    stageCoreutils(outDir, target).catch((error) => {
      console.error(`stage Coreutils: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
  }
}
