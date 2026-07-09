#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const outDir = process.argv[2];
const version = process.argv[3] || '1.3.14';
const target = process.argv[4] || '';

if (!outDir || !target) {
  console.error('usage: stage-bun-runtime.mjs <out-dir> [version] <os/arch>');
  process.exit(2);
}

const runtimes = runtimesForTarget(target);
if (runtimes.length === 0) {
  console.error(`unsupported Bun runtime target: ${target}`);
  process.exit(1);
}

const installDir = mkdtempSync(join(tmpdir(), 'voltui-bun-install-'));
try {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const packages = runtimes.map((runtime) => `${runtime.packageName}@${version}`);
  const install = spawnSync(
    npm,
    ['install', '--force', '--prefix', installDir, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', ...packages],
    { stdio: 'inherit', env: process.env },
  );
  if (install.status !== 0) {
    process.exit(install.status ?? 1);
  }

  for (const runtime of runtimes) {
    const source = join(installDir, 'node_modules', ...runtime.packageName.split('/'), 'bin', runtime.binaryName);
    if (!existsSync(source)) {
      console.error(`missing Bun binary: ${source}`);
      process.exit(1);
    }
    const dest = join(outDir, runtime.targetDir, 'bin', runtime.binaryName);
    mkdirSync(join(outDir, runtime.targetDir, 'bin'), { recursive: true });
    cpSync(source, dest);
    chmodSync(dest, 0o755);
  }

  console.log(`staged Bun ${version} for ${target} at ${outDir}`);
} finally {
  rmSync(installDir, { recursive: true, force: true });
}

function runtimesForTarget(platform) {
  switch (platform) {
    case 'darwin/universal':
      return [
        bunRuntime('@oven/bun-darwin-aarch64', 'bun-darwin-arm64'),
        bunRuntime('@oven/bun-darwin-x64', 'bun-darwin-amd64'),
      ];
    case 'darwin/arm64':
      return [bunRuntime('@oven/bun-darwin-aarch64', 'bun-darwin-arm64')];
    case 'darwin/amd64':
    case 'darwin/x64':
      return [bunRuntime('@oven/bun-darwin-x64', 'bun-darwin-amd64')];
    case 'windows/amd64':
    case 'windows/x64':
      return [bunRuntime('@oven/bun-windows-x64', 'bun-windows-amd64', 'bun.exe')];
    case 'windows/arm64':
      console.warn('warning: computer-use bundles x64 Bun on Windows ARM64 because @zavora-ai/computer-use-mcp only publishes win32-x64 native binaries.');
      return [bunRuntime('@oven/bun-windows-x64', 'bun-windows-amd64', 'bun.exe')];
    case 'linux/amd64':
    case 'linux/x64':
      return [bunRuntime('@oven/bun-linux-x64', 'bun-linux-amd64')];
    case 'linux/arm64':
      return [bunRuntime('@oven/bun-linux-aarch64', 'bun-linux-arm64')];
    default:
      return [];
  }
}

function bunRuntime(packageName, targetDir, binaryName = 'bun') {
  return { packageName, targetDir, binaryName };
}
