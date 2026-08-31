import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootPackage = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
const lockfile = readFileSync(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8');
const workspaceConfig = readFileSync(path.join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8');
const expectedLatestVersion = '0.1.1-rc.2';
const expectedVersion = rootPackage.dependencies['@deepseek-ai/dsh'];
const launcherPath = path.join(repositoryRoot, 'scripts', 'anyong.mjs');

function runLauncher(args, env = {}) {
  return execFileSync(process.execPath, [launcherPath, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 180_000,
  });
}

test('launcher uses the exact locally installed official DSH version', () => {
  assert.match(expectedVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.equal(expectedVersion, expectedLatestVersion);
  assert.equal(runLauncher(['--version']).trim(), expectedVersion);

  const launcher = readFileSync(launcherPath, 'utf8');
  assert.doesNotMatch(launcher, /\bnpx\b/);
  assert.match(launcher, /require\.resolve\(['"]@deepseek-ai\/dsh\/package\.json['"]\)/);
  assert.match(launcher, /spawn\(process\.execPath, \[dshBin, \.\.\.args\]/);
  assert.match(launcher, /child\.kill\(signal\)/);
});

test('supply-chain policy covers every locked official DSH package', () => {
  const lockedPackages = [...lockfile.matchAll(/^  '(@deepseek-ai\/dsh[^']*)@0\.1\.1-rc\.2':$/gm)]
    .map((match) => match[1]);
  const releaseAgeExclusions = new Set(
    [...workspaceConfig.matchAll(/^  - '(@deepseek-ai\/dsh[^']*)@0\.1\.1-rc\.2'$/gm)]
      .map((match) => match[1]),
  );

  assert.ok(lockedPackages.length > 0);
  assert.deepEqual(lockedPackages.filter((name) => !releaseAgeExclusions.has(name)), []);
});

test('Anyong override composes with the latest official web and headless profiles', async () => {
  const dshHome = await mkdtemp(path.join(tmpdir(), 'voltui-dsh-home-'));
  try {
    for (const args of [['web', '--dump-config'], ['headless', '--dump-config']]) {
      const config = runLauncher(args, { DSH_HOME: dshHome });
      assert.match(config, /id: agent-default-model/);
      assert.match(config, /provider: xg-gomodel/);
      assert.match(config, /model: vlm/);
      assert.match(config, /apiKeyEnv: XG_GOMODEL_API_KEY/);
      assert.doesNotMatch(config, /id: anyong-ui/);
    }
  } finally {
    await rm(dshHome, { recursive: true, force: true });
  }
});

test('web and headless aliases preserve application argument boundaries', () => {
  const source = readFileSync(launcherPath, 'utf8');
  assert.match(source, /isWeb \|\| userArgs\.length === 0/);
  assert.match(source, /runDsh\(\[\s*'--profile',\s*'web',\s*'--patch',\s*defaultProfilePatch,\s*\.\.\.cleanArgs/s);
  assert.match(source, /runDsh\(\[\s*'--profile',\s*'headless',\s*'--patch',\s*defaultProfilePatch,\s*\.\.\.cleanArgs/s);
  assert.doesNotMatch(source, /\.join\(['"] ['"]\)/);
});

test('distribution bundle pins the same official DSH version', async () => {
  execFileSync(process.execPath, [path.join(repositoryRoot, 'scripts', 'bundle.mjs')], {
    cwd: repositoryRoot,
    stdio: 'pipe',
  });

  const distributionPackage = JSON.parse(
    await readFile(path.join(repositoryRoot, 'dist', 'anyong-dsh', 'package.json'), 'utf8'),
  );
  assert.equal(distributionPackage.dependencies['@deepseek-ai/dsh'], expectedVersion);
  assert.equal(distributionPackage.engines.node, rootPackage.engines.node);
});

test('Node 26 is the supported script runtime', () => {
  assert.equal(Number(process.versions.node.split('.')[0]), 26);
  assert.equal(rootPackage.engines.node, '>=26.8.1 <27');
});
