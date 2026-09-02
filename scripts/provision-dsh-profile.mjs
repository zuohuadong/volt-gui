import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BROWSER_SKILL_PACKAGE = '@wxg-prc-cpg/browser-skill-dsh-plugin';

function readJsonObject(filePath) {
  if (!existsSync(filePath)) return {};
  const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`官方 DSH Profile manifest 必须是 JSON 对象：${filePath}`);
  }
  return parsed;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function writeJsonAtomically(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    renameSync(temporaryPath, filePath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function bundledBrowserSkillVersion(bundledPackageDir) {
  const sourceManifest = path.join(bundledPackageDir, 'package.json');
  if (!existsSync(sourceManifest)) throw new Error(`内置 BrowserSkill 包缺失：${sourceManifest}`);
  const sourcePackage = readJsonObject(sourceManifest);
  if (sourcePackage.name !== BROWSER_SKILL_PACKAGE || typeof sourcePackage.version !== 'string') {
    throw new Error(`内置 BrowserSkill 包无效：${sourceManifest}`);
  }
  return sourcePackage.version;
}

function updatedProfileManifest(dshHome, profileName, bundledVersion) {
  const profileDir = path.join(dshHome, 'profiles', profileName);
  mkdirSync(profileDir, { recursive: true });
  const manifestPath = path.join(profileDir, 'package.json');
  const existing = readJsonObject(manifestPath);
  const dependencies = isObject(existing.dependencies)
    ? { ...existing.dependencies }
    : {};
  const configuredVersion = dependencies[BROWSER_SKILL_PACKAGE];
  if (configuredVersion !== undefined && configuredVersion !== bundledVersion) {
    throw new Error(`DSH Profile 已配置不同 BrowserSkill 版本：${configuredVersion}`);
  }
  const existingDsh = isObject(existing.dsh) ? existing.dsh : {};
  const profile = isObject(existingDsh.profile)
    ? existing.dsh.profile
    : {};
  const bundles = Array.isArray(profile.bundles) ? profile.bundles.filter((bundle) => typeof bundle === 'string') : [];
  const baseBundle = profileName === 'web' ? '@deepseek-ai/dsh-web-app' : '@deepseek-ai/dsh-headless';
  if (!bundles.includes('@deepseek-ai/dsh-base')) bundles.unshift('@deepseek-ai/dsh-base');
  if (!bundles.includes(baseBundle)) bundles.push(baseBundle);
  dependencies[BROWSER_SKILL_PACKAGE] = bundledVersion;
  if (!bundles.includes(BROWSER_SKILL_PACKAGE)) bundles.push(BROWSER_SKILL_PACKAGE);
  const manifest = {
    ...existing,
    name: typeof existing.name === 'string' ? existing.name : `dsh-profile-${profileName}`,
    private: true,
    dependencies,
    dsh: { ...existingDsh, profile: { ...profile, bundles } },
  };
  return { manifest, manifestPath, profileDir };
}

function verifyInstalledBrowserSkill(targetDir, bundledVersion) {
  const installed = readJsonObject(path.join(targetDir, 'package.json'));
  if (installed.name !== BROWSER_SKILL_PACKAGE || installed.version !== bundledVersion) {
    throw new Error(`DSH Profile 中已有不同 BrowserSkill 版本：${targetDir}`);
  }
  for (const requiredPath of ['cordis.patch.yml', path.join('lib', 'index.mjs')]) {
    if (!existsSync(path.join(targetDir, requiredPath))) {
      throw new Error(`DSH Profile 中的 BrowserSkill 包不完整：${path.join(targetDir, requiredPath)}`);
    }
  }
}

function installBundledBrowserSkill(profileDir, bundledPackageDir, bundledVersion) {
  const targetDir = path.join(profileDir, 'node_modules', '@wxg-prc-cpg', 'browser-skill-dsh-plugin');
  if (existsSync(targetDir)) return verifyInstalledBrowserSkill(targetDir, bundledVersion);
  mkdirSync(path.dirname(targetDir), { recursive: true });
  const temporaryDir = `${targetDir}.${process.pid}.${Date.now()}.tmp`;
  try {
    cpSync(bundledPackageDir, temporaryDir, {
      recursive: true, force: false, errorOnExist: true,
      filter: (source) => path.basename(source) !== 'node_modules',
    });
    verifyInstalledBrowserSkill(temporaryDir, bundledVersion);
    renameSync(temporaryDir, targetDir);
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true });
  }
}

export function provisionBundledBrowserSkillProfile({ dshHome, profileName, bundledPackageDir }) {
  if (profileName !== 'web' && profileName !== 'headless') throw new Error(`不支持的官方 DSH Profile：${JSON.stringify(profileName)}`);
  const bundledVersion = bundledBrowserSkillVersion(bundledPackageDir);
  const { manifest, manifestPath, profileDir } = updatedProfileManifest(dshHome, profileName, bundledVersion);
  installBundledBrowserSkill(profileDir, bundledPackageDir, bundledVersion);
  const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
  if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== serializedManifest) writeJsonAtomically(manifestPath, manifest);
}
