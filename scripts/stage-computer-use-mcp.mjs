#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2];
const version = process.argv[3] || '6.2.0';
const target = process.argv[4] || '';

if (!outDir) {
  console.error('usage: stage-computer-use-mcp.mjs <out-dir> [version] [os/arch]');
  process.exit(2);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'package.json'),
  JSON.stringify({ private: true, dependencies: { '@zavora-ai/computer-use-mcp': version } }, null, 2) + '\n',
);

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const install = spawnSync(npm, ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: outDir,
  stdio: 'inherit',
  env: process.env,
});
if (install.status !== 0) {
  process.exit(install.status ?? 1);
}

const packageDir = join(outDir, 'node_modules', '@zavora-ai', 'computer-use-mcp');
const server = join(packageDir, 'dist', 'server.js');
if (!existsSync(server)) {
  console.error(`missing bundled server.js: ${server}`);
  process.exit(1);
}

const nativeFiles = readdirSync(packageDir).filter((name) => name.endsWith('.node'));
if (nativeFiles.length === 0) {
  console.error(`missing native .node files under ${packageDir}`);
  process.exit(1);
}
for (const name of expectedNativeFiles(target)) {
  if (!nativeFiles.includes(name)) {
    console.error(`missing target native binary ${name} under ${packageDir}`);
    process.exit(1);
  }
}

for (const dep of ['@modelcontextprotocol/sdk', 'zod']) {
  const depPackage = join(outDir, 'node_modules', dep, 'package.json');
  if (!existsSync(depPackage) || !statSync(depPackage).isFile()) {
    console.error(`missing runtime dependency ${dep}`);
    process.exit(1);
  }
}

rmSync(join(outDir, 'package-lock.json'), { force: true });
console.log(`staged @zavora-ai/computer-use-mcp@${version} with ${nativeFiles.length} native binaries at ${outDir}`);

function expectedNativeFiles(platform) {
  switch (platform) {
    case 'darwin/universal':
      return ['computer-use-napi.darwin-arm64.node', 'computer-use-napi.darwin-x64.node'];
    case 'darwin/arm64':
      return ['computer-use-napi.darwin-arm64.node'];
    case 'darwin/amd64':
    case 'darwin/x64':
      return ['computer-use-napi.darwin-x64.node'];
    case 'windows/amd64':
    case 'windows/x64':
      return ['computer-use-napi.win32-x64.node'];
    case 'windows/arm64':
      console.warn('warning: @zavora-ai/computer-use-mcp does not publish win32-arm64; Windows ARM64 requires x64 Node/native under emulation.');
      return ['computer-use-napi.win32-x64.node'];
    case 'linux/amd64':
    case 'linux/x64':
      return ['computer-use-napi.linux-x64.node'];
    case 'linux/arm64':
      return ['computer-use-napi.linux-arm64.node'];
    case '':
      return [];
    default:
      console.warn(`warning: no computer-use native validation rule for ${platform}`);
      return [];
  }
}
