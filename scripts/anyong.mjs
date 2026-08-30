#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const defaultProfilePatch = path.join(rootDir, 'profiles', 'anyong.yml');
const userArgs = process.argv.slice(2);
const dshPackageJson = require.resolve('@deepseek-ai/dsh/package.json');
const dshBin = path.join(path.dirname(dshPackageJson), 'lib', 'bin.js');

const isWeb = userArgs[0] === 'web' || userArgs[0] === '--web';
const isHeadless = userArgs[0] === 'headless' || userArgs[0] === '--headless';

function runDsh(args) {
  const child = spawn(process.execPath, [dshBin, ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
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
  ]);
} else if (isWeb || userArgs.length === 0) {
  const cleanArgs = userArgs.slice(1);
  runDsh([
    '--profile',
    'web',
    '--patch',
    defaultProfilePatch,
    ...cleanArgs,
  ]);
} else {
  runDsh(userArgs);
}
