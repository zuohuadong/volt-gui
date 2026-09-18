import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  OfficialDshRuntime,
  acknowledgeOfficialDshWelcomeNotice,
} from '../apps/desktop-electron/src/official-dsh-runtime.ts';
import { provisionBundledBrowserSkillProfile } from './provision-dsh-profile.mjs';
import { DshRemoteClient } from '../apps/desktop-electron/src/dsh-remote-client.ts';

const root = path.resolve(import.meta.dirname, '..');
const desktopRequire = createRequire(path.join(root, 'apps/desktop-electron/package.json'));
const { parse } = desktopRequire('yaml');
const legacyRoot = path.resolve(process.env.DSH_UPGRADE_FROM || path.join(root, '.agents/state/dsh-upgrade-20260907/legacy-runtime'));
const browserPackage = '@wxg-prc-cpg/browser-skill-dsh-plugin';
const weknoraPackage = '@wxg-prc-cpg/dsh-weknora';

async function request(runtime, method, payload) {
  const response = await fetch(`${runtime.url}/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'error',
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload }),
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, 200, method);
  const envelope = await response.json();
  assert.equal(envelope.result?.ok, true, `${method}: ${envelope.result?.error?.message}`);
  return envelope.result.value;
}

async function verifyEventConnection(client) {
  const controller = new AbortController();
  let timeout;
  try {
    await Promise.race([
      new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Authenticated DSH event stream timed out')), 10_000);
        void client.runEvents((event) => {
          if (event.type !== 'ready') return;
          resolve();
          controller.abort();
        }, controller.signal).catch(reject);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

function waitForLegacyUrl(child) {
  return new Promise((resolve, reject) => {
    let pending = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Legacy DSH did not publish its loopback URL'));
    }, 30_000);
    const inspect = (chunk) => {
      pending += chunk;
      const lines = pending.split(/\r?\n/u);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const match = line.trim().match(/^dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)$/u);
        if (!match || settled) continue;
        settled = true;
        clearTimeout(timeout);
        resolve(match[1]);
      }
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`Legacy DSH exited before startup: code=${code} signal=${signal}`));
    });
  });
}

async function stopLegacyRuntime(child) {
  if (!child) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // The process may have exited between the status check and taskkill.
    }
    return;
  }
  await new Promise((resolve) => {
    const timeout = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5_000);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
    child.kill('SIGTERM');
  });
}

async function startLegacyRuntime({ dshBin, dshHome, workspace, bundledBrowserSkillPackageDir, bundledWeKnoraPackageDir, environment }) {
  acknowledgeOfficialDshWelcomeNotice(dshHome);
  provisionBundledBrowserSkillProfile({
    dshHome,
    profileName: 'web',
    bundledPackageDir: bundledBrowserSkillPackageDir,
    additionalPlugins: bundledWeKnoraPackageDir
      ? [{ packageName: weknoraPackage, packageDir: bundledWeKnoraPackageDir }]
      : [],
  });
  const child = spawn(process.execPath, [dshBin, '--profile', 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'], {
    cwd: workspace,
    env: { ...process.env, ...environment, DSH_HOME: dshHome, DSH_CWD: workspace },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  try {
    return { child, url: await waitForLegacyUrl(child) };
  } catch (error) {
    await stopLegacyRuntime(child);
    throw error;
  }
}

test('real existing DSH data survives the bundled-plugin upgrade and restarts', { timeout: 240_000 }, async (t) => {
  const legacyBin = path.join(legacyRoot, 'node_modules/@deepseek-ai/dsh/lib/bin.js');
  const legacyBrowser = path.join(legacyRoot, 'node_modules', browserPackage, 'package.json');
  if (!existsSync(legacyBin) || !existsSync(legacyBrowser)) {
    t.skip('Set DSH_UPGRADE_FROM to an intact 0.1.1-rc.2 + BrowserSkill 0.1.2 runtime to run the live upgrade gate');
    return;
  }
  assert.equal(execFileSync(process.execPath, [legacyBin, '--version'], { encoding: 'utf8', windowsHide: true }).trim(), '0.1.1-rc.2',
    'DSH_UPGRADE_FROM must point to an intact 0.1.1-rc.2 deployment before staging the new runtime');
  assert.equal(JSON.parse(await readFile(path.join(legacyRoot, 'node_modules', browserPackage, 'package.json'), 'utf8')).version, '0.1.2',
    'DSH_UPGRADE_FROM must contain the previously bundled BrowserSkill 0.1.2');
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'anyong-real-upgrade-'));
  const dshHome = path.join(temporaryRoot, 'home');
  const workspace = path.join(temporaryRoot, 'workspace');
  await mkdir(workspace);
  const officeEntry = path.resolve(path.dirname(desktopRequire.resolve('@officecli/officecli')), '..', 'officecli.js');
  const options = {
    dshHome, workspace, executable: process.execPath,
    patchFile: path.join(root, 'profiles/anyong.yml'),
    startupTimeoutMs: 90_000,
    environment: {
      ANYONG_OFFICECLI_COMMAND: process.execPath,
      ANYONG_OFFICECLI_ARGS_JSON: JSON.stringify([officeEntry, 'mcp']),
    },
  };
  let runtime;
  let legacyRuntime;
  try {
    legacyRuntime = await startLegacyRuntime({
      dshBin: legacyBin,
      dshHome,
      workspace,
      bundledBrowserSkillPackageDir: path.join(legacyRoot, 'node_modules', browserPackage),
      bundledWeKnoraPackageDir: path.dirname(desktopRequire.resolve(`${weknoraPackage}/package.json`)),
      environment: {
        ...options.environment,
        ANYONG_OFFICECLI_ARGS_JSON: JSON.stringify([path.join(legacyRoot, 'node_modules/@officecli/officecli/officecli.js'), 'mcp']),
      },
    });
    const { sessionId } = await request(legacyRuntime, 'session.create', { cwd: workspace });
    await request(legacyRuntime, 'session.rename', { sessionId, title: 'Migration preserved session' });
    const originalHistory = await request(legacyRuntime, 'session.history', { sessionId, maxMessages: 80 });
    assert.equal(originalHistory.projections?.values?.title, 'Migration preserved session');
    const originalEvents = originalHistory.events.map((entry) => entry.event);
    assert.ok(originalEvents.some((event) => event.type === 'session/title' && event.data?.title === 'Migration preserved session'));
    await request(legacyRuntime, 'credentials.set', { ref: 'VOLT_UPGRADE_TEST', value: 'temporary-upgrade-test-only' });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await stopLegacyRuntime(legacyRuntime.child);
    legacyRuntime = undefined;
    const credentialPath = path.join(dshHome, '.credentials.yaml');
    const originalCredentials = parse(await readFile(credentialPath, 'utf8'));
    const settingsPath = path.join(dshHome, 'settings.yaml');
    const originalSettings = await readFile(settingsPath, 'utf8');
    const manifestPath = path.join(dshHome, 'profiles/web/package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.dsh.profile.custom = { preserved: true };
    await writeFile(manifestPath, JSON.stringify(manifest));
    const userPatch = path.join(dshHome, 'profiles/web/cordis.patch.yml');
    await writeFile(userPatch, '# Preserve user-owned profile overrides\n[]\n');

    for (let attempt = 0; attempt < 2; attempt += 1) {
      runtime = new OfficialDshRuntime({
        ...options,
        dshBin: path.join(path.dirname(desktopRequire.resolve('@deepseek-ai/dsh/package.json')), 'lib/bin.js'),
        bundledBrowserSkillPackageDir: path.dirname(desktopRequire.resolve(`${browserPackage}/package.json`)),
        bundledProfilePlugins: [{ packageName: weknoraPackage, packageDir: path.dirname(desktopRequire.resolve(`${weknoraPackage}/package.json`)) }],
      });
      await runtime.start();
      const client = new DshRemoteClient(await Promise.resolve(runtime.url));
      await client.authenticate();
      await verifyEventConnection(client);
      const sessions = await client.call('session/list', { _request: {} });
      const migratedSession = sessions.items.find((session) => session.sessionId === sessionId);
      assert.ok(migratedSession, 'The existing session must remain discoverable after migration');
      // Cold summaries may omit projection cache after a legacy upgrade; the durable follow snapshot is authoritative.
      const history = await client.readFirstStreamItem('session/follow', { request: { address: { kind: 'session', sessionId }, maxMessages: 80 } });
      assert.ok(Array.isArray(history.records));
      assert.equal(history.header.id, sessionId);
      assert.equal(history.projections?.values?.title, 'Migration preserved session');
      const migratedEvents = history.records.filter((record) => record.type === 'event').map((record) => record.event);
      assert.deepEqual(migratedEvents.slice(0, originalEvents.length), originalEvents,
        'All legacy durable events must survive the session format migration in order');
      const credentials = await client.call('credentials/describe', { refs: ['VOLT_UPGRADE_TEST'] });
      assert.equal(credentials.VOLT_UPGRADE_TEST.configured, true);
      const inventory = await client.call('pluginInventory/list', {});
      for (const moduleName of [browserPackage, '@deepseek-ai/dsh-mcp-client']) {
        const entry = inventory.entries.find((candidate) => candidate.moduleName === moduleName);
        assert.equal(entry?.enabled, true, moduleName);
        assert.equal(entry?.fiberPhase, 'active', moduleName);
      }
      await runtime.stop();
      const migratedCredentials = parse(await readFile(credentialPath, 'utf8'));
      for (const [ref, original] of Object.entries(originalCredentials)) {
        assert.ok(JSON.stringify(migratedCredentials[ref]) === JSON.stringify(original), 'An existing credential changed during upgrade');
      }
      assert.equal(await readFile(settingsPath, 'utf8'), originalSettings);
      const upgraded = JSON.parse(await readFile(manifestPath, 'utf8'));
      assert.equal(upgraded.dependencies[browserPackage], '0.2.1');
      assert.deepEqual(upgraded.dsh.profile.custom, { preserved: true });
      assert.equal(await readFile(userPatch, 'utf8'), '# Preserve user-owned profile overrides\n[]\n');
    }
  } finally {
    await stopLegacyRuntime(legacyRuntime?.child);
    await runtime?.stop();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
