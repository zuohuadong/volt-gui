#!/usr/bin/env node

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const defaultProfilePatch = path.join(rootDir, 'profiles', 'anyong.yml');
const userArgs = process.argv.slice(2);

// Check if running custom DSH CLI vs Official DSH profile
const isWeb = userArgs.includes('web') || userArgs.includes('--web');
const isHeadless = userArgs.includes('headless') || userArgs.includes('--headless');

if (isWeb) {
  // Automatically inject our @xgic/dsh-plugin-ui profile patch
  const cleanArgs = userArgs.filter((a) => a !== 'web' && a !== '--web');
  const dshArgs = [
    'web',
    '--patch',
    defaultProfilePatch,
    ...cleanArgs,
  ];

  console.log(`[Anyong DSH] Launching Web Workbench with @xgic/dsh-plugin-ui loaded by default...`);
  const child = spawn('npx', ['dsh', ...dshArgs], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
} else if (isHeadless) {
  const prompt = userArgs.filter((a) => a !== 'headless' && a !== '--headless').join(' ');
  const dshArgs = [
    '--profile',
    'headless',
    '--patch',
    defaultProfilePatch,
    prompt,
  ];

  const child = spawn('npx', ['dsh', ...dshArgs], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
} else {
  // Default to interactive DSH terminal CLI with builtin tools and MCP
  const cliBin = path.join(rootDir, 'packages', 'dsh-cli', 'dist', 'bin.js');
  const child = spawn('node', [cliBin, ...userArgs], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}
