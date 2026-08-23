#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), '..');
const productionExtensions = new Set(['.go', '.js', '.mjs', '.svelte', '.ts']);
const excludedSegments = new Set(['dist', 'dist-electron', 'generated', 'testdata', 'tests', '__tests__']);

const activeFrontendFiles = [
  'apps/desktop-frontend/src/electron-main.ts',
  'apps/desktop-frontend/src/electron.d.ts',
  'apps/desktop-frontend/src/components/ElectronWorkbench.svelte',
  'apps/desktop-frontend/src/lib/electron-dsh-client.ts',
];

const activeRuntimeRoots = [
  'apps/desktop-electron/src',
  'internal',
  'packages/dsh-core/src',
  'packages/dsh-plugin-ui/src',
  'packages/dsh-plugins/src',
  'packages/dsh-server/src',
];

const rules = [
  {
    id: 'seed-source',
    message: '运行时记录不能以 source="seed" 注入业务数据',
    pattern: /\bsource\s*[:=]\s*["']seed["']/i,
  },
  {
    id: 'seed-factory',
    message: '生产运行时不能保留默认业务数据工厂或浏览器灌入函数',
    pattern: /\b(?:defaultAgents|defaultAutomations|defaultWorkbenchProjects|defaultTodos|hydrateBrowserPreview|defaultAgentCards)\b/,
  },
  {
    id: 'in-memory-task-records',
    message: '桌面任务必须来自真实 DSH/IPC 资源，不能使用进程内 taskRecords',
    pattern: /\btaskRecords\b/,
  },
  {
    id: 'browser-fake-success',
    message: '未连接 Electron/DSH 时不能伪造保存或模型回复成功',
    pattern: /浏览器预览已应用草稿|浏览器预览已收到这条消息|mock success|fake success/i,
  },
  {
    id: 'fabricated-record-id',
    message: '生产运行时不能用随机 ID 合成持久化成功记录',
    pattern: /return\s*\{\s*data:\s*\{\s*id:\s*crypto\.randomUUID\(\)/,
  },
  {
    id: 'legacy-wails-runtime',
    message: 'Electron 活跃运行时不能访问 Wails window.go binding',
    pattern: /window\.go\b/,
  },
];

function normalizedRelativePath(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function isExcluded(relativePath) {
  const segments = relativePath.split('/');
  if (segments.some((segment) => excludedSegments.has(segment))) return true;
  const basename = segments.at(-1) ?? '';
  return basename.endsWith('_test.go') || /\.(?:spec|test)\.[^.]+$/.test(basename);
}

async function walk(root, directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = normalizedRelativePath(root, absolute);
    if (isExcluded(relative)) continue;
    if (entry.isDirectory()) files.push(...await walk(root, absolute));
    else if (entry.isFile() && productionExtensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

async function existingFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function productionFiles(root) {
  const files = [];
  for (const relative of activeRuntimeRoots) {
    const directory = path.join(root, relative);
    try {
      files.push(...await walk(root, directory));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  for (const relative of activeFrontendFiles) {
    const file = path.join(root, relative);
    if (await existingFile(file)) files.push(file);
  }
  return [...new Set(files)].sort();
}

export async function scanRuntimeMocks({ root = repositoryRoot } = {}) {
  const findings = [];
  for (const file of await productionFiles(root)) {
    const relative = normalizedRelativePath(root, file);
    const content = await readFile(file, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      for (const rule of rules) {
        const match = lines[index].match(rule.pattern);
        if (!match) continue;
        findings.push({
          rule: rule.id,
          message: rule.message,
          file: relative,
          line: index + 1,
          column: (match.index ?? 0) + 1,
          match: match[0],
        });
      }
    }
  }
  return findings.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.rule.localeCompare(right.rule));
}

function parseRootArgument(argv) {
  const inline = argv.find((argument) => argument.startsWith('--root='));
  if (inline) return path.resolve(inline.slice('--root='.length));
  const index = argv.indexOf('--root');
  return index >= 0 && argv[index + 1] ? path.resolve(argv[index + 1]) : repositoryRoot;
}

async function main() {
  const findings = await scanRuntimeMocks({ root: parseRootArgument(process.argv.slice(2)) });
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ findings, count: findings.length }, null, 2)}\n`);
    if (findings.length) process.exitCode = 1;
    return;
  }
  if (!findings.length) {
    console.log('Runtime mock gate passed: active Electron and DSH production paths are clean.');
    return;
  }
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}:${finding.column} [${finding.rule}] ${finding.message}: ${finding.match}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await main();
}
