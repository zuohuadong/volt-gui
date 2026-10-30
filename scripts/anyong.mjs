#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { provisionBundledBrowserSkillProfile } from './provision-dsh-profile.mjs';
import { ensureOfficeCliBinary } from './third-party-office-tools.mjs';

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
const integrationsMcpScript = path.join(rootDir, 'scripts', 'anyong-integrations-mcp.mjs');
const profilePlugins = [
  '@voltui/dsh-office', '@voltui/dsh-mcp-apps', '@voltui/dsh-native-ui',
  '@deepseek-ai/dsh-experimental-voice-input-bundle',
];
const stagedTools = path.join(rootDir, 'apps', 'desktop-electron', '.tool-runtime');
const stagedBsk = path.join(rootDir, 'apps', 'desktop-electron', '.browser-skill-runtime', process.platform === 'win32' ? 'bsk.exe' : 'bsk');
const memorixEntry = path.join(rootDir, 'node_modules', 'memorix', 'dist', 'cli', 'index.js');
const toolEnvironment = {};
if (process.platform === 'win32') {
  const tools = {
    ANYONG_PYTHON_COMMAND: ['python', 'python.exe'],
    ANYONG_BUN_COMMAND: ['bun', 'bun.exe'],
    ANYONG_COREUTILS_COMMAND: ['coreutils', 'coreutils.exe'],
    ANYONG_PWSH_PATH: ['powershell', 'pwsh.exe'],
    ANYONG_POWERSHELL: ['powershell', 'pwsh.exe'],
  };
  const directories = new Set();
  for (const [key, segments] of Object.entries(tools)) {
    const executable = path.join(stagedTools, ...segments);
    if (!existsSync(executable)) continue;
    toolEnvironment[key] = process.env[key] || executable;
    directories.add(path.dirname(executable));
  }
  const parentPath = Object.entries(process.env).find(([key]) => key.toUpperCase() === 'PATH')?.[1] || '';
  toolEnvironment.PATH = [...directories, parentPath].filter(Boolean).join(path.delimiter);
}
let browserSkillPackageJson;
try {
  browserSkillPackageJson = require.resolve('@wxg-prc-cpg/browser-skill-dsh-plugin/package.json');
} catch (error) {
  if (error?.code !== 'MODULE_NOT_FOUND') throw error;
  browserSkillPackageJson = desktopRequire.resolve('@wxg-prc-cpg/browser-skill-dsh-plugin/package.json');
}
const browserSkillPackageDir = path.dirname(browserSkillPackageJson);
let weknoraPackageJson;
try {
  weknoraPackageJson = require.resolve('@wxg-prc-cpg/dsh-weknora/package.json');
} catch (error) {
  if (error?.code !== 'MODULE_NOT_FOUND') throw error;
  weknoraPackageJson = desktopRequire.resolve('@wxg-prc-cpg/dsh-weknora/package.json');
}
const weknoraPackageDir = path.dirname(weknoraPackageJson);
let intranetAuthPackageJson;
try {
  intranetAuthPackageJson = require.resolve('@voltui/dsh-intranet-auth/package.json');
} catch (error) {
  if (error?.code !== 'MODULE_NOT_FOUND') throw error;
  intranetAuthPackageJson = desktopRequire.resolve('@voltui/dsh-intranet-auth/package.json');
}
const intranetAuthPackageDir = path.dirname(intranetAuthPackageJson);

const isWeb = userArgs[0] === 'web' || userArgs[0] === '--web';
const isHeadless = userArgs[0] === 'headless' || userArgs[0] === '--headless';

function runDsh(args, profileName) {
  const dshHome = process.env.DSH_HOME?.trim() || path.join(homedir(), '.dsh');
  if (profileName) {
    provisionBundledBrowserSkillProfile({
      dshHome,
      profileName,
      bundledPackageDir: browserSkillPackageDir,
      additionalPlugins: [{
        packageName: '@wxg-prc-cpg/dsh-weknora',
        packageDir: weknoraPackageDir,
      }, {
        packageName: '@voltui/dsh-intranet-auth',
        packageDir: intranetAuthPackageDir,
      }, ...profilePlugins.map((packageName) => ({
        packageName,
        packageDir: path.dirname(require.resolve(`${packageName}/package.json`)),
      }))],
    });
  }
  const child = spawn(process.execPath, [dshBin, ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      ...toolEnvironment,
      ANYONG_BSK_PATH: process.env.ANYONG_BSK_PATH || process.env.BSK_PATH || (existsSync(stagedBsk) ? stagedBsk : 'bsk'),
      ANYONG_OFFICECLI_COMMAND: process.execPath,
      ANYONG_OFFICECLI_ARGS_JSON: JSON.stringify([officeCliEntry, 'mcp']),
      ANYONG_INTEGRATIONS_MCP_COMMAND: process.execPath,
      ANYONG_INTEGRATIONS_MCP_SCRIPT: integrationsMcpScript,
      ANYONG_MEMORIX_COMMAND: process.execPath,
      ANYONG_MEMORIX_ARGS_JSON: JSON.stringify([memorixEntry, 'serve', '--mode', 'micro', '--cwd', process.cwd()]),
      MEMORIX_DATA_DIR: path.join(dshHome, 'memorix'),
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
  await ensureOfficeCliBinary(officeCliEntry);
  runDsh([
    '--profile',
    'headless',
    '--patch',
    defaultProfilePatch,
    ...cleanArgs,
  ], 'headless');
} else if (isWeb || userArgs.length === 0) {
  const cleanArgs = userArgs.slice(1);
  await ensureOfficeCliBinary(officeCliEntry);
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
