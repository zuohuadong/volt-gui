import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DshRemoteClient } from '../apps/desktop-electron/src/dsh-remote-client.ts';
import { extractTrustedDshUrl } from '../apps/desktop-electron/src/official-dsh-runtime.ts';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootPackage = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
const lockfile = readFileSync(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8');
const workspaceConfig = readFileSync(path.join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8');
const expectedSupportedVersion = '0.1.5-rc.1';
const expectedVersion = rootPackage.dependencies['@deepseek-ai/dsh'];
const launcherPath = path.join(repositoryRoot, 'scripts', 'anyong.mjs');

function runLauncher(args, env = {}) {
  return execFileSync(process.execPath, [launcherPath, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 240_000,
  });
}

function waitForRuntimeUrl(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      settled = true;
      reject(new Error('DSH web startup timed out'));
    }, 240_000);
    let pending = '';
    let settled = false;
    const inspect = (chunk) => {
      pending += chunk;
      const consume = (value) => {
        const runtimeUrl = extractTrustedDshUrl(value);
        if (!runtimeUrl || settled) return false;
        settled = true;
        clearTimeout(timeout);
        resolve(runtimeUrl);
        return true;
      };
      if (consume(pending)) return;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (consume(line)) return;
      }
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('error', (error) => { settled = true; clearTimeout(timeout); reject(error); });
    child.once('exit', (code, signal) => {
      if (settled) return;
      const runtimeUrl = extractTrustedDshUrl(pending);
      if (runtimeUrl) {
        settled = true;
        clearTimeout(timeout);
        resolve(runtimeUrl);
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`DSH web exited before startup: code=${code} signal=${signal}`));
    });
  });
}

function startWebRuntime(dshHome, environment = {}) {
  const child = spawn(process.execPath, [launcherPath, 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'], {
    cwd: repositoryRoot,
    env: { ...process.env, ...environment, DSH_HOME: dshHome },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const url = waitForRuntimeUrl(child);
  return { child, url };
}

async function stopWebRuntime(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    try {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {}
    return;
  }
  await new Promise((resolve) => {
    const timeout = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 10_000);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
    child.kill('SIGTERM');
  });
}

async function connectRuntime(runtime) {
  const client = new DshRemoteClient(await runtime.url);
  await client.authenticate();
  return client;
}

test('launcher uses the exact locally installed official DSH version', () => {
  assert.match(expectedVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.equal(expectedVersion, expectedSupportedVersion);
  assert.equal(runLauncher(['--version']).trim(), expectedVersion);

  const launcher = readFileSync(launcherPath, 'utf8');
  assert.doesNotMatch(launcher, /\bnpx\b/);
  assert.match(launcher, /require\.resolve\(['"]@deepseek-ai\/dsh\/package\.json['"]\)/);
  assert.match(launcher, /spawn\(process\.execPath, \[dshBin, \.\.\.args\]/);
  assert.match(launcher, /child\.kill\(signal\)/);
});

test('supply-chain policy covers every locked official DSH package', () => {
  const versionPattern = expectedVersion.replaceAll('.', '\\.').replaceAll('-', '\\-');
  const lockedPackages = [...lockfile.matchAll(new RegExp(`^  '(@deepseek-ai/dsh[^']*)@${versionPattern}':$`, 'gm'))]
    .map((match) => match[1]);
  const releaseAgeExclusions = new Set(
    [...workspaceConfig.matchAll(new RegExp(`^  - '(@deepseek-ai/dsh[^']*)@${versionPattern}'$`, 'gm'))]
      .map((match) => match[1]),
  );

  assert.ok(lockedPackages.length > 0);
  assert.deepEqual(lockedPackages.filter((name) => !releaseAgeExclusions.has(name)), []);
});

test('security patch overrides keep vulnerable transitive versions out of the lockfile', () => {
  assert.match(workspaceConfig, /^overrides:$/m);
  assert.match(workspaceConfig, /^  sharp: '0\.35\.4'$/m);
  assert.match(workspaceConfig, /^  js-yaml: '4\.3\.2'$/m);
  assert.match(workspaceConfig, /^  hono: '4\.13\.5'$/m);
  assert.match(lockfile, /^  sharp@0\.35\.4:$/m);
  assert.match(lockfile, /^  js-yaml@4\.3\.2:$/m);
  assert.match(lockfile, /^  hono@4\.13\.5:$/m);
  assert.doesNotMatch(lockfile, /^  sharp@0\.35\.3:$/m);
  assert.doesNotMatch(lockfile, /^  js-yaml@4\.3\.1:$/m);
  assert.doesNotMatch(lockfile, /^  hono@4\.13\.3:$/m);
});

test('Anyong override composes with the supported official web and headless profiles', async () => {
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

test('project integration defaults match the approved policy', async () => {
  const dshHome = await mkdtemp(path.join(tmpdir(), 'voltui-dsh-default-policy-'));
  const enabledHome = await mkdtemp(path.join(tmpdir(), 'voltui-dsh-enabled-policy-'));
  const githubHome = await mkdtemp(path.join(tmpdir(), 'voltui-dsh-github-policy-'));
  let runtime;
  let enabledRuntime;
  let githubRuntime;
  try {
    runtime = startWebRuntime(dshHome);
    const client = await connectRuntime(runtime);
    const inventory = await client.call('pluginInventory/list', {});
    const entry = (inventory.entries ?? []).find((candidate) => candidate.moduleName === '@deepseek-ai/dsh-tool-web');
    assert.equal(entry?.enabled, false);
    const optionalEntries = (inventory.entries ?? []).filter((candidate) => candidate.moduleName === '@deepseek-ai/dsh-mcp-client' && /^include:mcp-(github|cnb|sentry|feishu|document-import)$/u.test(candidate.entryId));
    assert.ok(optionalEntries.length >= 5);
    const byId = new Map(optionalEntries.map((candidate) => [candidate.entryId, candidate]));
    for (const entryId of ['include:mcp-github', 'include:mcp-cnb', 'include:mcp-feishu']) assert.equal(byId.get(entryId)?.enabled, false);
    for (const entryId of ['include:mcp-sentry', 'include:mcp-document-import']) assert.equal(byId.get(entryId)?.enabled, true);
    const profile = readFileSync(path.join(repositoryRoot, 'profiles', 'anyong.yml'), 'utf8');
    assert.match(profile, /ANYONG_WEB_RETRIEVAL_ENABLED === '1'/);
    assert.match(profile, /ANYONG_GITHUB_ENABLED !== '1'/);
    assert.match(profile, /ANYONG_CNB_ENABLED !== '1'/);
    assert.match(profile, /ANYONG_FEISHU_ENABLED !== '1'/);
    assert.match(profile, /ANYONG_SENTRY_ENABLED === '0'/);
    assert.match(profile, /ANYONG_DOCUMENT_IMPORT_ENABLED === '0'/);

    enabledRuntime = startWebRuntime(enabledHome, { ANYONG_WEB_RETRIEVAL_ENABLED: '1' });
    const enabledClient = await connectRuntime(enabledRuntime);
    const enabledInventory = await enabledClient.call('pluginInventory/list', {});
    const enabledEntry = (enabledInventory.entries ?? []).find((candidate) => candidate.moduleName === '@deepseek-ai/dsh-tool-web');
    assert.equal(enabledEntry?.enabled, true);

    githubRuntime = startWebRuntime(githubHome, { ANYONG_GITHUB_ENABLED: '1' });
    const githubClient = await connectRuntime(githubRuntime);
    const githubEntry = (await githubClient.call('pluginInventory/list', {})).entries?.find((candidate) => candidate.entryId === 'include:mcp-github');
    assert.equal(githubEntry?.enabled, true);
    assert.equal(githubEntry?.fiberPhase, 'active');
  } finally {
    if (runtime) await stopWebRuntime(runtime.child);
    if (enabledRuntime) await stopWebRuntime(enabledRuntime.child);
    if (githubRuntime) await stopWebRuntime(githubRuntime.child);
    await rm(dshHome, { recursive: true, force: true });
    await rm(enabledHome, { recursive: true, force: true });
    await rm(githubHome, { recursive: true, force: true });
  }
});

test('WeKnora remote endpoints require HTTPS and an explicit host allowlist', () => {
  const profile = readFileSync(path.join(repositoryRoot, 'profiles', 'anyong.yml'), 'utf8');
  assert.match(profile, /WEKNORA_ALLOWED_HOSTS/);
  assert.match(profile, /WEKNORA_BASE_URL must use HTTPS and an approved host/);
  assert.match(profile, /\[::1\]/);
});

test('official DSH credentials remain configured after a web runtime restart', async () => {
  const dshHome = await mkdtemp(path.join(tmpdir(), 'voltui-dsh-credentials-'));
  const ref = 'VOLT_TEST_API_KEY';
  let runtime;
  try {
    runtime = startWebRuntime(dshHome);
    let client = await connectRuntime(runtime);
    await client.call('credentials/set', { ref, value: 'temporary-test-secret' });
    let described = await client.call('credentials/describe', { refs: [ref] });
    assert.equal(described[ref]?.configured, true);
    await stopWebRuntime(runtime.child);

    runtime = startWebRuntime(dshHome);
    client = await connectRuntime(runtime);
    described = await client.call('credentials/describe', { refs: [ref] });
    assert.equal(described[ref]?.configured, true);
    await client.call('credentials/unset', { ref });
  } finally {
    if (runtime) await stopWebRuntime(runtime.child);
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
  assert.deepEqual(distributionPackage.overrides, { sharp: '0.35.4', 'js-yaml': '4.3.2', hono: '4.13.5' });
});

test('Node 26 is the supported script runtime', () => {
  assert.equal(Number(process.versions.node.split('.')[0]), 26);
  assert.equal(rootPackage.engines.node, '>=26.8.1 <27');
});
