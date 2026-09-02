#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { provisionBundledBrowserSkillProfile } from './provision-dsh-profile.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const desktopRequire = createRequire(path.join(rootDir, 'apps', 'desktop-electron', 'package.json'));

const defaultProfilePatch = path.join(rootDir, 'profiles', 'anyong.yml');
const userArgs = process.argv.slice(2);
const dshPackageJson = require.resolve('@deepseek-ai/dsh/package.json');
const dshBin = path.join(path.dirname(dshPackageJson), 'lib', 'bin.js');
const officeCliInstaller = require.resolve('@officecli/officecli');
const officeCliEntry = path.resolve(path.dirname(officeCliInstaller), '..', 'officecli.js');
let browserSkillPackageJson;
try {
  browserSkillPackageJson = require.resolve('@wxg-prc-cpg/browser-skill-dsh-plugin/package.json');
} catch (error) {
  if (error?.code !== 'MODULE_NOT_FOUND') throw error;
  browserSkillPackageJson = desktopRequire.resolve('@wxg-prc-cpg/browser-skill-dsh-plugin/package.json');
}
const browserSkillPackageDir = path.dirname(browserSkillPackageJson);

const isWeb = userArgs[0] === 'web' || userArgs[0] === '--web';
const isHeadless = userArgs[0] === 'headless' || userArgs[0] === '--headless';

function runDsh(args, profileName) {
  if (profileName) {
    provisionBundledBrowserSkillProfile({
      dshHome: process.env.DSH_HOME?.trim() || path.join(homedir(), '.dsh'),
      profileName,
      bundledPackageDir: browserSkillPackageDir,
    });
  }
  const child = spawn(process.execPath, [dshBin, ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      ANYONG_BSK_PATH: process.env.ANYONG_BSK_PATH || process.env.BSK_PATH || 'bsk',
      ANYONG_OFFICECLI_COMMAND: process.execPath,
      ANYONG_OFFICECLI_ARGS_JSON: JSON.stringify([officeCliEntry, 'mcp']),
      DSH_CWD: process.cwd(),
    },
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => child.kill(signal));
  }

  child.on('error', (error) => {
    console.error(`[Anyong DSH] Failed to start the locked DSH runtime: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

if (isHeadless) {
  const cleanArgs = userArgs.slice(1);
  runDsh([
    '--profile',
    'headless',
    '--patch',
    defaultProfilePatch,
    ...cleanArgs,
  ], 'headless');
} else if (isWeb || userArgs.length === 0) {
  const cleanArgs = userArgs.slice(1);
  runDsh([
    '--profile',
    'web',
    '--patch',
    defaultProfilePatch,
    ...cleanArgs,
  ], 'web');
} else {
  runDsh(userArgs);
}
