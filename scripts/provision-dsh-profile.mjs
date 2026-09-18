import { closeSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BROWSER_SKILL_PACKAGE = '@wxg-prc-cpg/browser-skill-dsh-plugin';
const PREVIOUS_BUNDLED_VERSIONS = new Set(['0.1.2', '0.2.0']);
const CURRENT_BUNDLED_VERSION = '0.2.1';

function canUpgradeBundledVersion(version, bundledVersion) {
  return PREVIOUS_BUNDLED_VERSIONS.has(version) && bundledVersion === CURRENT_BUNDLED_VERSION;
}

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

function writeAtomically(filePath, content) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporaryPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
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

function updatedProfileManifest(dshHome, profileName, bundledVersion, additionalPlugins = []) {
  const profileDir = path.join(dshHome, 'profiles', profileName);
  mkdirSync(profileDir, { recursive: true });
  const manifestPath = path.join(profileDir, 'package.json');
  const existing = readJsonObject(manifestPath);
  const dependencies = isObject(existing.dependencies)
    ? { ...existing.dependencies }
    : {};
  const configuredVersion = dependencies[BROWSER_SKILL_PACKAGE];
  if (configuredVersion !== undefined && configuredVersion !== bundledVersion
    && !canUpgradeBundledVersion(configuredVersion, bundledVersion)) {
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
  for (const plugin of additionalPlugins) {
    const configuredVersion = dependencies[plugin.packageName];
    if (configuredVersion !== undefined && configuredVersion !== plugin.version) {
      throw new Error(`DSH Profile 已配置不同 ${plugin.packageName} 版本：${configuredVersion}`);
    }
    dependencies[plugin.packageName] = plugin.version;
    if (!bundles.includes(plugin.packageName)) bundles.push(plugin.packageName);
  }
  const manifest = {
    ...existing,
    name: typeof existing.name === 'string' ? existing.name : `dsh-profile-${profileName}`,
    private: true,
    dependencies,
    dsh: { ...existingDsh, profile: { ...profile, bundles } },
  };
  return { manifest, manifestPath, profileDir };
}

function profilePluginTarget(profileDir, packageName) {
  return path.join(profileDir, 'node_modules', ...packageName.split('/'));
}

function verifyBundledProfilePlugin(packageDir, packageName, version) {
  const sourceManifest = readJsonObject(path.join(packageDir, 'package.json'));
  if (sourceManifest.name !== packageName || sourceManifest.version !== version) {
    throw new Error(`内置 DSH Profile Bundle 包无效：${packageDir}`);
  }
}

function installBundledProfilePlugin(profileDir, plugin) {
  verifyBundledProfilePlugin(plugin.packageDir, plugin.packageName, plugin.version);
  const targetDir = profilePluginTarget(profileDir, plugin.packageName);
  if (existsSync(targetDir)) {
    if (lstatSync(targetDir).isSymbolicLink()) {
      throw new Error(`DSH Profile Bundle 不允许使用符号链接：${targetDir}`);
    }
    verifyBundledProfilePlugin(targetDir, plugin.packageName, plugin.version);
    return undefined;
  }

  mkdirSync(path.dirname(targetDir), { recursive: true });
  const temporaryDir = `${targetDir}.${process.pid}.${Date.now()}.tmp`;
  try {
    cpSync(plugin.packageDir, temporaryDir, {
      recursive: true,
      force: false,
      errorOnExist: true,
      filter: (source) => path.basename(source) !== 'node_modules',
    });
    verifyBundledProfilePlugin(temporaryDir, plugin.packageName, plugin.version);
    renameSync(temporaryDir, targetDir);
    return () => rmSync(targetDir, { recursive: true, force: true });
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true });
  }
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
  // 上次进程可能在旧包改名后退出；先恢复唯一的可升级旧包，再重新尝试迁移。
  if (!existsSync(targetDir)) {
    const recoverableBackups = [...PREVIOUS_BUNDLED_VERSIONS]
      .filter((version) => canUpgradeBundledVersion(version, bundledVersion))
      .map((version) => `${targetDir}.backup-${version}`)
      .filter(existsSync);
    if (recoverableBackups.length > 1) {
      throw new Error(`BrowserSkill 迁移存在多个可恢复备份，请先检查：${recoverableBackups.join(', ')}`);
    }
    if (recoverableBackups.length === 1) renameSync(recoverableBackups[0], targetDir);
  }
  let upgrading = false;
  let backupDir = '';
  if (existsSync(targetDir)) {
    const installedVersion = readJsonObject(path.join(targetDir, 'package.json')).version;
    if (installedVersion === bundledVersion) {
      verifyInstalledBrowserSkill(targetDir, bundledVersion);
      return;
    }
    if (!canUpgradeBundledVersion(installedVersion, bundledVersion) || lstatSync(targetDir).isSymbolicLink()) {
      throw new Error(`DSH Profile 中已有不同 BrowserSkill 版本：${targetDir}`);
    }
    verifyInstalledBrowserSkill(targetDir, installedVersion);
    backupDir = `${targetDir}.backup-${installedVersion}`;
    if (existsSync(backupDir)) throw new Error(`BrowserSkill 迁移备份已存在，请先检查：${backupDir}`);
    upgrading = true;
  }
  mkdirSync(path.dirname(targetDir), { recursive: true });
  const temporaryDir = `${targetDir}.${process.pid}.${Date.now()}.tmp`;
  let movedLegacy = false;
  try {
    cpSync(bundledPackageDir, temporaryDir, {
      recursive: true, force: false, errorOnExist: true,
      filter: (source) => path.basename(source) !== 'node_modules',
    });
    verifyInstalledBrowserSkill(temporaryDir, bundledVersion);
    if (upgrading) {
      const manifestPath = path.join(profileDir, 'package.json');
      const manifestBackup = `${backupDir}.profile.json`;
      if (existsSync(manifestPath)) writeAtomically(manifestBackup, readFileSync(manifestPath));
      renameSync(targetDir, backupDir);
      movedLegacy = true;
    }
    renameSync(temporaryDir, targetDir);
    if (movedLegacy) {
      return () => {
        // 先隔离新包再恢复旧包，清理中断不能留下半删除的生效目录。
        const rollbackDir = `${targetDir}.${process.pid}.${Date.now()}.rollback`;
        renameSync(targetDir, rollbackDir);
        renameSync(backupDir, targetDir);
        rmSync(rollbackDir, { recursive: true, force: true });
      };
    }
    return () => rmSync(targetDir, { recursive: true, force: true });
  } catch (error) {
    if (movedLegacy && !existsSync(targetDir)) renameSync(backupDir, targetDir);
    throw error;
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true });
  }
}

export function provisionBundledBrowserSkillProfile({ dshHome, profileName, bundledPackageDir, additionalPlugins = [] }) {
  if (profileName !== 'web' && profileName !== 'headless') throw new Error(`不支持的官方 DSH Profile：${JSON.stringify(profileName)}`);
  const bundledVersion = bundledBrowserSkillVersion(bundledPackageDir);
  const profileDir = path.join(dshHome, 'profiles', profileName);
  mkdirSync(profileDir, { recursive: true });
  const lockPath = path.join(profileDir, '.anyong-browser-skill.lock');
  let lock;
  try {
    lock = openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`BrowserSkill Profile 正在迁移或上次迁移异常退出。确认所有使用该 Profile 的 DSH/暗涌进程已退出后，才可移除锁并重试：${lockPath}`, { cause: error });
    }
    throw error;
  }
  try {
    // 不按超时抢占锁：慢磁盘上的同步复制不能被另一个启动进程接管。
    writeFileSync(lock, `${process.pid}\n`);
    const normalizedPlugins = additionalPlugins.map((plugin) => {
      const packageDir = plugin.packageDir ?? plugin.bundledPackageDir;
      if (!packageDir) throw new Error(`缺少 DSH Profile Bundle 路径：${plugin.packageName ?? 'unknown'}`);
      const packageManifest = readJsonObject(path.join(packageDir, 'package.json'));
      return {
        packageDir,
        packageName: plugin.packageName ?? packageManifest.name,
        version: plugin.version ?? packageManifest.version,
      };
    });
    const { manifest, manifestPath } = updatedProfileManifest(dshHome, profileName, bundledVersion, normalizedPlugins);
    const rollbacks = [];
    try {
      const browserRollback = installBundledBrowserSkill(profileDir, bundledPackageDir, bundledVersion);
      if (browserRollback) rollbacks.push(browserRollback);
      for (const plugin of normalizedPlugins) {
        const pluginRollback = installBundledProfilePlugin(profileDir, plugin);
        if (pluginRollback) rollbacks.push(pluginRollback);
      }
      const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
      if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== serializedManifest) writeAtomically(manifestPath, serializedManifest);
    } catch (error) {
      for (const rollback of rollbacks.reverse()) rollback();
      throw error;
    }
  } finally {
    closeSync(lock);
    rmSync(lockPath, { force: true });
  }
}
