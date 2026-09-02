import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { provisionBundledBrowserSkillProfile } from './provision-dsh-profile.mjs';

async function createBundledPackage(root) {
  const packageDir = path.join(root, 'bundled-browser-skill');
  await mkdir(path.join(packageDir, 'lib'), { recursive: true });
  await mkdir(path.join(packageDir, 'node_modules', 'ignored'), { recursive: true });
  await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({ name: '@wxg-prc-cpg/browser-skill-dsh-plugin', version: '0.1.2' }));
  await writeFile(path.join(packageDir, 'cordis.patch.yml'), '[]\n');
  await writeFile(path.join(packageDir, 'lib', 'index.mjs'), 'export default {};\n');
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
    assert.equal(manifest.dependencies['@wxg-prc-cpg/browser-skill-dsh-plugin'], '0.1.2');
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
