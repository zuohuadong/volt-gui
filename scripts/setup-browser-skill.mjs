#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { provisionBundledBrowserSkillProfile } from './provision-dsh-profile.mjs';
import { browserSkill, browserSkillCli } from './third-party-browser-tools.mjs';

const rootDir = path.resolve(import.meta.dirname, '..');
const desktopDir = path.join(rootDir, 'apps', 'desktop-electron');
const desktopRequire = createRequire(path.join(desktopDir, 'package.json'));
const bundledPackageDir = path.dirname(desktopRequire.resolve(`${browserSkill.packageName}/package.json`));
const stagedBsk = path.join(desktopDir, '.browser-skill-runtime', process.platform === 'win32' ? 'bsk.exe' : 'bsk');
const dshHome = process.env.DSH_HOME?.trim()
  || (process.platform === 'win32' && process.env.APPDATA
    ? path.join(process.env.APPDATA, 'Anyong', 'dsh')
    : path.join(process.env.HOME || rootDir, '.anyong', 'dsh'));
const mode = process.argv[2] || 'check';

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, { stdio: 'inherit', encoding: 'utf8', windowsHide: true, ...options });
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`BrowserSkill CLI 不可用：${command}`, { cause: error });
    throw error;
  }
}

function bskCommand() {
  return process.env.BSK_PATH || (existsSync(stagedBsk) ? stagedBsk : 'bsk');
}

function verifyBskVersion() {
  const versionOutput = run(bskCommand(), ['--version'], { stdio: 'pipe' }).trim();
  if (versionOutput !== `bsk ${browserSkillCli.version}`) {
    throw new Error(`BrowserSkill CLI 版本不匹配：期望 ${browserSkillCli.version}，实际 ${versionOutput}`);
  }
  console.log(`[ok] ${versionOutput}`);
}

function provisionProfiles() {
  for (const profileName of ['web', 'headless']) {
    provisionBundledBrowserSkillProfile({ dshHome, profileName, bundledPackageDir });
  }
}

function verifyProfile(profileName) {
  const manifestPath = path.join(dshHome, 'profiles', profileName, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.dependencies?.[browserSkill.packageName] !== browserSkill.version
    || !manifest.dsh?.profile?.bundles?.includes(browserSkill.packageName)) {
    throw new Error(`${profileName} Profile 未内置 ${browserSkill.packageName}@${browserSkill.version}`);
  }
}

if (mode === 'install') {
  run(process.execPath, [path.join(desktopDir, 'scripts', 'stage-browser-skill-cli.mjs')]);
  provisionProfiles();
  verifyBskVersion();
  console.log(`[ok] BrowserSkill ${browserSkill.version} 与 bsk ${browserSkillCli.version} 已离线内置到官方 DSH Profile。`);
} else if (mode === 'check') {
  provisionProfiles();
  verifyProfile('web');
  verifyProfile('headless');
  verifyBskVersion();
  console.log(`[ok] BrowserSkill ${browserSkill.version} 已在 web/headless Profile 默认启用。`);
} else if (mode === 'doctor') {
  run(bskCommand(), ['doctor']);
} else {
  throw new Error(`未知模式 ${JSON.stringify(mode)}，请使用 install、check 或 doctor。`);
}
