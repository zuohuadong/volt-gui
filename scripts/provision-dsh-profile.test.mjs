import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import test from 'node:test';

import { provisionBundledBrowserSkillProfile } from './provision-dsh-profile.mjs';

async function createBundledPackage(root, version = '0.2.1') {
  const packageDir = path.join(root, 'bundled-browser-skill');
  await mkdir(path.join(packageDir, 'lib'), { recursive: true });
  await mkdir(path.join(packageDir, 'node_modules', 'ignored'), { recursive: true });
  await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({ name: '@wxg-prc-cpg/browser-skill-dsh-plugin', version }));
  await writeFile(path.join(packageDir, 'cordis.patch.yml'), '[]\n');
  await writeFile(path.join(packageDir, 'lib', 'index.mjs'), 'export default {};\n');
  await writeFile(path.join(packageDir, 'node_modules', 'ignored', 'marker'), 'ignored');
  return packageDir;
}

async function createAdditionalProfileBundle(root) {
  const packageDir = path.join(root, 'bundled-weknora');
  await mkdir(path.join(packageDir, 'dist'), { recursive: true });
  await mkdir(path.join(packageDir, 'node_modules', 'ignored'), { recursive: true });
  await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({ name: '@wxg-prc-cpg/dsh-weknora', version: '0.1.0' }));
  await writeFile(path.join(packageDir, 'cordis.patch.yml'), '- insert:\n    - id: weknora\n');
  await writeFile(path.join(packageDir, 'dist', 'index.js'), 'export default {}\n');
  await writeFile(path.join(packageDir, 'node_modules', 'ignored', 'marker'), 'ignored');
  return packageDir;
}

test('provisions BrowserSkill while preserving the user profile', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'anyong-profile-provision-'));
  const dshHome = path.join(root, 'dsh');
  const profileDir = path.join(dshHome, 'profiles', 'web');
  const bundledPackageDir = await createBundledPackage(root);
  await mkdir(profileDir, { recursive: true });
  await writeFile(path.join(profileDir, 'package.json'), JSON.stringify({
    name: 'custom-web-profile', private: true, scripts: { inspect: 'echo preserved' },
    dependencies: { '@example/custom-plugin': '1.2.3' },
    dsh: { profile: { bundles: ['@example/custom-plugin'], custom: true }, custom: true },
  }, null, 2));
  try {
    const options = { dshHome, profileName: 'web', bundledPackageDir };
    provisionBundledBrowserSkillProfile(options);
    const manifestPath = path.join(profileDir, 'package.json');
    const first = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(first);
    assert.equal(manifest.name, 'custom-web-profile');
    assert.deepEqual(manifest.scripts, { inspect: 'echo preserved' });
    assert.equal(manifest.dependencies['@example/custom-plugin'], '1.2.3');
    assert.equal(manifest.dependencies['@wxg-prc-cpg/browser-skill-dsh-plugin'], '0.2.1');
    assert.equal(manifest.dsh.custom, true);
    assert.equal(manifest.dsh.profile.custom, true);
    assert.deepEqual(manifest.dsh.profile.bundles, [
      '@deepseek-ai/dsh-base', '@example/custom-plugin', '@deepseek-ai/dsh-web-app', '@wxg-prc-cpg/browser-skill-dsh-plugin',
    ]);
    assert.equal(await readFile(path.join(profileDir, 'node_modules', '@wxg-prc-cpg', 'browser-skill-dsh-plugin', 'cordis.patch.yml'), 'utf8'), '[]\n');
    await assert.rejects(readFile(path.join(profileDir, 'node_modules', '@wxg-prc-cpg', 'browser-skill-dsh-plugin', 'node_modules', 'ignored', 'marker')));
    provisionBundledBrowserSkillProfile(options);
    assert.equal(await readFile(manifestPath, 'utf8'), first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('provisions additional DSH Profile Bundles idempotently', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'anyong-additional-profile-provision-'));
  const dshHome = path.join(root, 'dsh');
  const profileDir = path.join(dshHome, 'profiles', 'web');
  const bundledPackageDir = await createBundledPackage(root);
  const weknoraPackageDir = await createAdditionalProfileBundle(root);
  const options = {
    dshHome,
    profileName: 'web',
    bundledPackageDir,
    additionalPlugins: [{ packageName: '@wxg-prc-cpg/dsh-weknora', packageDir: weknoraPackageDir }],
  };
  try {
    provisionBundledBrowserSkillProfile(options);
    const manifestPath = path.join(profileDir, 'package.json');
    const first = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(first);
    assert.equal(manifest.dependencies['@wxg-prc-cpg/dsh-weknora'], '0.1.0');
    assert.equal(manifest.dsh.profile.bundles.filter((name) => name === '@wxg-prc-cpg/dsh-weknora').length, 1);
    const targetDir = path.join(profileDir, 'node_modules', '@wxg-prc-cpg', 'dsh-weknora');
    assert.equal(await readFile(path.join(targetDir, 'dist', 'index.js'), 'utf8'), 'export default {}\n');
    await assert.rejects(readFile(path.join(targetDir, 'node_modules', 'ignored', 'marker')));
    provisionBundledBrowserSkillProfile(options);
    assert.equal(await readFile(manifestPath, 'utf8'), first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function legacyProfileFixture(t, profileName, installedVersion = '0.1.2') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'anyong-profile-upgrade-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dshHome = path.join(root, 'dsh');
  const bundledPackageDir = await createBundledPackage(root, installedVersion);
  provisionBundledBrowserSkillProfile({ dshHome, profileName, bundledPackageDir });
  const profileDir = path.join(dshHome, 'profiles', profileName);
  const manifestPath = path.join(profileDir, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.dependencies['@example/custom-plugin'] = '3.2.1';
  manifest.dsh.profile.bundles.push('@example/custom-plugin');
  manifest.dsh.profile.custom = { preserve: true };
  await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(path.join(profileDir, 'cordis.patch.yml'), '# user overrides\n');
  const targetDir = path.join(profileDir, 'node_modules', '@wxg-prc-cpg', 'browser-skill-dsh-plugin');
  const legacyManifest = await readFile(manifestPath, 'utf8');
  await createBundledPackage(root);
  return { dshHome, profileName, bundledPackageDir, profileDir, manifestPath, targetDir, legacyManifest };
}

for (const profileName of ['web', 'headless']) {
  test(`upgrades the shipped BrowserSkill in ${profileName} without losing user configuration`, async (t) => {
    const fixture = await legacyProfileFixture(t, profileName);
    provisionBundledBrowserSkillProfile(fixture);
    const upgraded = JSON.parse(await readFile(fixture.manifestPath, 'utf8'));
    assert.equal(upgraded.dependencies['@wxg-prc-cpg/browser-skill-dsh-plugin'], '0.2.1');
    assert.equal(upgraded.dependencies['@example/custom-plugin'], '3.2.1');
    assert.deepEqual(upgraded.dsh.profile.custom, { preserve: true });
    assert.equal(upgraded.dsh.profile.bundles.filter((name) => name === '@wxg-prc-cpg/browser-skill-dsh-plugin').length, 1);
    assert.equal(await readFile(path.join(fixture.profileDir, 'cordis.patch.yml'), 'utf8'), '# user overrides\n');
    const backupDir = `${fixture.targetDir}.backup-0.1.2`;
    assert.equal(JSON.parse(await readFile(path.join(backupDir, 'package.json'), 'utf8')).version, '0.1.2');
    assert.equal(await readFile(`${backupDir}.profile.json`, 'utf8'), fixture.legacyManifest);
    const first = await readFile(fixture.manifestPath, 'utf8');
    provisionBundledBrowserSkillProfile(fixture);
    assert.equal(await readFile(fixture.manifestPath, 'utf8'), first);
    assert.equal(JSON.parse(await readFile(path.join(fixture.targetDir, 'package.json'), 'utf8')).version, '0.2.1');
  });
}

test('upgrades the immediately previous BrowserSkill release without overwriting its backup', async (t) => {
  const fixture = await legacyProfileFixture(t, 'web', '0.2.0');
  provisionBundledBrowserSkillProfile(fixture);
  assert.equal(JSON.parse(await readFile(path.join(fixture.targetDir, 'package.json'), 'utf8')).version, '0.2.1');
  assert.equal(JSON.parse(await readFile(path.join(`${fixture.targetDir}.backup-0.2.0`, 'package.json'), 'utf8')).version, '0.2.0');
});

test('an incomplete update leaves the old plugin and manifest intact', async (t) => {
  const fixture = await legacyProfileFixture(t, 'web');
  await rm(path.join(fixture.bundledPackageDir, 'lib', 'index.mjs'));
  assert.throws(() => provisionBundledBrowserSkillProfile(fixture), /不完整/);
  assert.equal(await readFile(fixture.manifestPath, 'utf8'), fixture.legacyManifest);
  assert.equal(JSON.parse(await readFile(path.join(fixture.targetDir, 'package.json'), 'utf8')).version, '0.1.2');
});

test('recovers an interrupted directory swap before retrying migration', async (t) => {
  const fixture = await legacyProfileFixture(t, 'headless');
  const backupDir = `${fixture.targetDir}.backup-0.1.2`;
  await cp(fixture.manifestPath, `${backupDir}.profile.json`);
  await rename(fixture.targetDir, backupDir);
  provisionBundledBrowserSkillProfile(fixture);
  assert.equal(JSON.parse(await readFile(path.join(fixture.targetDir, 'package.json'), 'utf8')).version, '0.2.1');
  assert.equal(await readFile(`${backupDir}.profile.json`, 'utf8'), fixture.legacyManifest);
});

test('rolls back the plugin when the manifest commit fails, then permits retry', async (t) => {
  const fixture = await legacyProfileFixture(t, 'web');
  const renameSync = fs.renameSync;
  const injectedFailure = t.mock.method(fs, 'renameSync', (source, target) => {
    if (target === fixture.manifestPath) throw Object.assign(new Error('manifest is locked'), { code: 'EPERM' });
    return renameSync(source, target);
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => provisionBundledBrowserSkillProfile(fixture), /manifest is locked/);
    assert.equal(await readFile(fixture.manifestPath, 'utf8'), fixture.legacyManifest);
    assert.equal(JSON.parse(await readFile(path.join(fixture.targetDir, 'package.json'), 'utf8')).version, '0.1.2');
  } finally {
    injectedFailure.mock.restore();
    syncBuiltinESMExports();
  }
  provisionBundledBrowserSkillProfile(fixture);
  assert.equal(JSON.parse(await readFile(path.join(fixture.targetDir, 'package.json'), 'utf8')).version, '0.2.1');
});

test('repairs a partial manifest backup before committing an upgrade', async (t) => {
  const fixture = await legacyProfileFixture(t, 'web');
  const backupPath = `${fixture.targetDir}.backup-0.1.2.profile.json`;
  await writeFile(backupPath, '{"dependencies":');
  provisionBundledBrowserSkillProfile(fixture);
  assert.equal(await readFile(backupPath, 'utf8'), fixture.legacyManifest);
});

test('a partial backup write fails without swapping the old package and permits retry', async (t) => {
  const fixture = await legacyProfileFixture(t, 'web');
  const backupPath = `${fixture.targetDir}.backup-0.1.2.profile.json`;
  const writeFileSync = fs.writeFileSync;
  const injectedFailure = t.mock.method(fs, 'writeFileSync', (target, ...args) => {
    if (typeof target === 'string' && target.startsWith(`${backupPath}.`)) {
      writeFileSync(target, '{');
      throw new Error('backup write interrupted');
    }
    return writeFileSync(target, ...args);
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => provisionBundledBrowserSkillProfile(fixture), /backup write interrupted/);
    assert.equal(await readFile(fixture.manifestPath, 'utf8'), fixture.legacyManifest);
    assert.equal(JSON.parse(await readFile(path.join(fixture.targetDir, 'package.json'), 'utf8')).version, '0.1.2');
    assert.equal(fs.existsSync(backupPath), false);
  } finally {
    injectedFailure.mock.restore();
    syncBuiltinESMExports();
  }
  provisionBundledBrowserSkillProfile(fixture);
  assert.equal(await readFile(backupPath, 'utf8'), fixture.legacyManifest);
});

for (const failurePoint of ['restore', 'cleanup']) {
  test(`recovers when rollback ${failurePoint} is interrupted`, async (t) => {
    const fixture = await legacyProfileFixture(t, 'web');
    const backupDir = `${fixture.targetDir}.backup-0.1.2`;
    const renameSync = fs.renameSync;
    const rmSync = fs.rmSync;
    const renameFailure = t.mock.method(fs, 'renameSync', (source, target) => {
      if (target === fixture.manifestPath) throw new Error('manifest commit interrupted');
      if (failurePoint === 'restore' && source === backupDir) throw new Error('rollback restore interrupted');
      return renameSync(source, target);
    });
    const cleanupFailure = t.mock.method(fs, 'rmSync', (target, options) => {
      if (failurePoint === 'cleanup' && target.endsWith('.rollback')) {
        rmSync(path.join(target, 'lib'), { recursive: true, force: true });
        throw new Error('rollback cleanup interrupted');
      }
      return rmSync(target, options);
    });
    syncBuiltinESMExports();
    try {
      assert.throws(() => provisionBundledBrowserSkillProfile(fixture), /rollback .* interrupted/);
      assert.equal(await readFile(fixture.manifestPath, 'utf8'), fixture.legacyManifest);
      const preserved = failurePoint === 'restore' ? backupDir : fixture.targetDir;
      assert.equal(JSON.parse(await readFile(path.join(preserved, 'package.json'), 'utf8')).version, '0.1.2');
      assert.ok(fs.existsSync(path.join(preserved, 'lib', 'index.mjs')));
    } finally {
      renameFailure.mock.restore();
      cleanupFailure.mock.restore();
      syncBuiltinESMExports();
    }
    provisionBundledBrowserSkillProfile(fixture);
    assert.equal(JSON.parse(await readFile(path.join(fixture.targetDir, 'package.json'), 'utf8')).version, '0.2.1');
  });
}

test('excludes a second process until the first transaction has rolled back', async (t) => {
  const fixture = await legacyProfileFixture(t, 'web');
  const renameSync = fs.renameSync;
  const injectedFailure = t.mock.method(fs, 'renameSync', (source, target) => {
    if (target === fixture.manifestPath) {
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
        import assert from 'node:assert/strict';
        import { provisionBundledBrowserSkillProfile } from ${JSON.stringify(new URL('./provision-dsh-profile.mjs', import.meta.url).href)};
        assert.throws(() => provisionBundledBrowserSkillProfile(${JSON.stringify(fixture)}),
          (error) => error.cause?.code === 'EEXIST');
      `], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
      assert.equal(child.status, 0, child.stderr);
      throw new Error('first writer failed');
    }
    return renameSync(source, target);
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => provisionBundledBrowserSkillProfile(fixture), /first writer failed/);
    assert.equal(await readFile(fixture.manifestPath, 'utf8'), fixture.legacyManifest);
    assert.equal(JSON.parse(await readFile(path.join(fixture.targetDir, 'package.json'), 'utf8')).version, '0.1.2');
  } finally {
    injectedFailure.mock.restore();
    syncBuiltinESMExports();
  }
  provisionBundledBrowserSkillProfile(fixture);
  assert.equal(JSON.parse(await readFile(path.join(fixture.targetDir, 'package.json'), 'utf8')).version, '0.2.1');
});

test('never takes over an abandoned lock without explicit operator recovery', async (t) => {
  const fixture = await legacyProfileFixture(t, 'headless');
  const lockPath = path.join(fixture.profileDir, '.anyong-browser-skill.lock');
  await writeFile(lockPath, '0\n');
  assert.throws(() => provisionBundledBrowserSkillProfile(fixture), /确认所有使用该 Profile/);
  assert.equal(await readFile(fixture.manifestPath, 'utf8'), fixture.legacyManifest);
  assert.equal(await readFile(lockPath, 'utf8'), '0\n');
  await rm(lockPath);
  provisionBundledBrowserSkillProfile(fixture);
  assert.equal(JSON.parse(await readFile(path.join(fixture.targetDir, 'package.json'), 'utf8')).version, '0.2.1');
});

test('does not downgrade an unfamiliar user-managed version', async (t) => {
  const fixture = await legacyProfileFixture(t, 'web');
  const manifest = JSON.parse(fixture.legacyManifest);
  manifest.dependencies['@wxg-prc-cpg/browser-skill-dsh-plugin'] = '0.3.0';
  const original = JSON.stringify(manifest);
  await writeFile(fixture.manifestPath, original);
  assert.throws(() => provisionBundledBrowserSkillProfile(fixture), /已配置不同 BrowserSkill 版本/);
  assert.equal(await readFile(fixture.manifestPath, 'utf8'), original);
});

test('refuses a different BrowserSkill version in a user profile', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'anyong-profile-version-'));
  const dshHome = path.join(root, 'dsh');
  const profileDir = path.join(dshHome, 'profiles', 'headless');
  const bundledPackageDir = await createBundledPackage(root);
  await mkdir(profileDir, { recursive: true });
  await writeFile(path.join(profileDir, 'package.json'), JSON.stringify({ dependencies: { '@wxg-prc-cpg/browser-skill-dsh-plugin': '0.1.1' } }));
  try {
    assert.throws(() => provisionBundledBrowserSkillProfile({ dshHome, profileName: 'headless', bundledPackageDir }), /已配置不同 BrowserSkill 版本/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
