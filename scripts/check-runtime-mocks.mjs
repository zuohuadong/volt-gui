#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const RUNTIME_MOCK_ALLOW_MARKER = 'runtime-mock-guard: allow-legacy-cleanup';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), '..');

const excludedSegments = new Set(['dist', 'generated', 'testdata', 'tests', 'wailsjs']);
const productionExtensions = new Set(['.go', '.js', '.mjs', '.svelte', '.ts']);

const legacySeedIDs = [
  'todo-preview-load',
  'todo-agent-template',
  'todo-link-review',
  'preflight-validation',
  'desktop-frontend-gate',
  'wails-go-gate',
  'local-preview-regression',
  'volt-gui-aoristlawer-map',
  'volt-gui-ia-notes',
  'volt-gui-quality-gate',
  'volt-gui-relation-sample',
  'lurefree-release-checklist',
  'lurefree-map-regression',
  'homepage-restore-log',
  'version-review',
  'customer-workflow',
  'automation-review',
  'project-risk',
  'customer-weekly',
  'automation-run',
  'requirement-template',
  'project-retro',
  'automation-config',
  'desktop-security',
  'agent-acceptance',
  'customer-boundary',
  'memory-sync',
  'material-index',
  'model-refresh',
  'create-agent',
  'update-automation',
  'link-project',
  'product-lab',
  'ops-growth',
  'product-lab-system-1',
  'product-lab-system-2',
  'ops-growth-system-1',
  'delivery-review-system-1',
];

const legacySeedNames = [
  'Volt GUI 桌面端重构',
  'Lurefree 小程序发布',
  '品牌主页恢复与部署',
  '内部研发团队',
  '运营增长团队',
  '产品研发组',
  '运营增长组',
  '交付审查组',
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const lineRules = [
  {
    id: 'seed-source',
    message: '运行时记录不能以 source="seed" 注入业务数据',
    pattern: /\bsource\s*[:=]\s*["']seed["']/i,
    allowLegacyCleanup: true,
  },
  {
    id: 'seed-factory',
    message: '生产代码不能保留默认业务数据工厂、合并器或浏览器灌入函数',
    pattern: /\b(?:defaultAgents|defaultAutomations|defaultWorkbenchProjects|defaultTodos|defaultProjectMaterials|defaultWorkbenchData|defaultTeamRooms|defaultKnowledgeMaterialIDs|mergeDefaultAgents|hydrateBrowserPreview|defaultAgentCards|defaultCapabilityBuckets)\b/,
  },
  {
    id: 'in-memory-task-records',
    message: 'Work dashboard tasks 必须来自真实资源，不能使用进程内 taskRecords',
    pattern: /\btaskRecords\b/,
  },
  {
    id: 'legacy-seed-id',
    message: '发现已知运行时 seed ID；仅遗留数据删除条件可使用显式 cleanup 注释豁免',
    pattern: new RegExp(`\\b(?:id|ID)\\s*[:=]{1,3}\\s*["'](?:${legacySeedIDs.map(escapeRegExp).join('|')})["']`),
    allowLegacyCleanup: true,
    pathPrefix: 'desktop/',
  },
  {
    id: 'legacy-agent-seed-record',
    message: '发现已知默认 Agent 业务记录',
    pattern: /\b(?:id|ID)\s*:\s*["'](?:code-review|research|automation)["'][^\n]*(?:代码审查 Agent|资料研究 Agent|自动化 Agent)/,
    allowLegacyCleanup: true,
    pathPrefix: 'desktop/',
  },
  {
    id: 'legacy-seed-name',
    message: '发现已知演示业务专名；仅遗留数据删除条件可使用显式 cleanup 注释豁免',
    pattern: new RegExp(`\\b(?:name|Name|title|Title)\\s*[:=]{1,3}\\s*["'](?:${legacySeedNames.map(escapeRegExp).join('|')})["']`),
    allowLegacyCleanup: true,
    pathPrefix: 'desktop/',
  },
  {
    id: 'fabricated-status-metric',
    message: '发现伪造成功状态或运行指标',
    pattern: /最近一次通过|\b(?:runs|Runs)\s*:\s*128\b|\b(?:progress|Progress)\s*:\s*["']64%["']/,
    allowLegacyCleanup: true,
  },
  {
    id: 'browser-fake-success',
    message: '浏览器预览未连接后端时不能伪造保存或模型回复成功',
    pattern: /浏览器预览已应用草稿|浏览器预览已收到这条消息/,
  },
];

const contentRules = [
  {
    id: 'unbound-persisted-ternary',
    message: '缺少 Wails binding 时不能合成本地记录并继续报告持久化成功',
    pattern: /const\s+persisted\s*=\s*typeof\s+\w+\s*===\s*["']function["'];[\s\S]{0,900}?persisted\s*\?\s*await[\s\S]{0,400}?:\s*\{/g,
    files: new Set(['desktop/frontend/src/App.svelte']),
  },
  {
    id: 'unbound-save-ternary',
    message: '缺少 Wails binding 时不能用三元表达式合成本地保存结果',
    pattern: /typeof\s+\w+\s*===\s*["']function["']\s*\?\s*await\s+\w+\([\s\S]{0,400}?\)\s*:\s*\{/g,
    files: new Set(['desktop/frontend/src/App.svelte']),
  },
  {
    id: 'unbound-persist-echo',
    message: '缺少 Wails binding 时不能把输入对象原样作为持久化结果返回',
    pattern: /if\s*\(\s*typeof\s+(?:save|persist)\w+\s*!==\s*["']function["']\s*\)\s*return\s+(?:run|room|input|record|data)\s*;/g,
    files: new Set(['desktop/frontend/src/App.svelte']),
  },
  {
    id: 'optional-delete-local-success',
    message: '删除 binding 缺失时不能继续删除本地数组并报告成功',
    pattern: /if\s*\(\s*typeof\s+delete\w+\s*===\s*["']function["']\s*\)\s*\{[\s\S]{0,300}?\}\s*\w+\s*=\s*\w+\.filter/g,
    files: new Set(['desktop/frontend/src/App.svelte']),
  },
  {
    id: 'resource-provider-fake-create',
    message: '资源适配器不能在未接入后端的分支中合成 create/update 成功记录',
    pattern: /return\s*\{\s*data:\s*\{\s*id:\s*crypto\.randomUUID\(\)|return\s*\{\s*data:\s*\{\s*id,\s*\.\.\./g,
    files: new Set(['desktop/frontend/src/lib/resourceProvider.ts']),
  },
];

function normalizedRelativePath(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function isExcluded(relativePath) {
  const segments = relativePath.split('/');
  if (segments.some((segment) => excludedSegments.has(segment))) return true;
  const basename = segments.at(-1) ?? '';
  if (basename.endsWith('_test.go') || /\.(?:spec|test)\.[^.]+$/.test(basename)) return true;
  return basename === 'provider_presets.go';
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

async function productionFiles(root) {
  const files = [];
  const frontendRoot = path.join(root, 'desktop', 'frontend', 'src');
  const internalRoot = path.join(root, 'internal');
  for (const directory of [frontendRoot, internalRoot]) {
    try {
      files.push(...await walk(root, directory));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  try {
    const desktopEntries = await readdir(path.join(root, 'desktop'), { withFileTypes: true });
    for (const entry of desktopEntries) {
      if (!entry.isFile() || path.extname(entry.name) !== '.go') continue;
      const absolute = path.join(root, 'desktop', entry.name);
      if (!isExcluded(normalizedRelativePath(root, absolute))) files.push(absolute);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return [...new Set(files)].sort();
}

function decodeUnicodeEscapes(value) {
  return value.replace(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})/gi, (_, braced, plain) => {
    try {
      return String.fromCodePoint(Number.parseInt(braced ?? plain, 16));
    } catch {
      return _;
    }
  });
}

const legacyCleanupFunctionsByFile = new Map([
  ['desktop/agents_app.go', new Set(['isLegacySeedAgent'])],
  ['desktop/todos_app.go', new Set(['isLegacySeedTodo'])],
  ['desktop/projects_app.go', new Set(['isLegacySeedProject'])],
  ['desktop/project_materials_app.go', new Set(['isLegacySeedProjectMaterial'])],
  ['desktop/automations_app.go', new Set(['isLegacySeedAutomation'])],
  ['desktop/workbench_data_app.go', new Set([
    'migrateLegacyWorkbenchSeeds',
    'filterLegacyCalendarEvents',
    'filterLegacyReports',
    'filterLegacyKnowledgeDocuments',
    'filterLegacyRegulations',
    'filterLegacySyncJobs',
    'filterLegacyOperationLogs',
    'filterLegacyTeamRooms',
    'filterLegacyTeamMessages',
  ])],
]);

function enclosingGoFunctionRange(lines, index) {
  for (let start = index; start >= 0; start -= 1) {
    const match = lines[start].match(/^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (!match) continue;
    let balance = 0;
    for (let lineIndex = start; lineIndex <= index; lineIndex += 1) {
      balance += (lines[lineIndex].match(/\{/g) ?? []).length;
      balance -= (lines[lineIndex].match(/\}/g) ?? []).length;
      if (lineIndex < index && balance <= 0) return null;
    }
    if (balance <= 0) return null;
    let end = index;
    for (let lineIndex = index + 1; lineIndex < lines.length; lineIndex += 1) {
      balance += (lines[lineIndex].match(/\{/g) ?? []).length;
      balance -= (lines[lineIndex].match(/\}/g) ?? []).length;
      end = lineIndex;
      if (balance <= 0) break;
    }
    return { name: match[1], start, end };
  }
  return null;
}

function isPureExpectedFingerprint(lines, index, functionRange) {
  const line = lines[index];
  if (!/^\s*expected\s*:=\s*(?:PersistentAgentView|Workbench(?:Todo|Project|Automation|Customer|CalendarEvent|Report|KnowledgeDocument|Regulation|SyncJob|OperationLog|TeamRoom|TeamChatMessage)View)\s*\{.*\}\s*$/.test(line)) return false;
  if (/\b(?:append|copy|make|new|delete|panic|recover|go|defer)\b|\b[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(line.replace(/^\s*expected\s*:=\s*[A-Za-z0-9_]+/, ''))) return false;
  let boundary = functionRange.end;
  for (let lineIndex = index + 1; lineIndex <= functionRange.end; lineIndex += 1) {
    if (/^\s*(?:case\b|default\s*:|expected\s*:=)/.test(lines[lineIndex])) {
      boundary = lineIndex;
      break;
    }
  }
  const uses = lines.slice(index + 1, boundary).filter((candidate) => /\bexpected\b/.test(candidate));
  if (uses.length !== 1) return false;
  const consumer = uses[0].trim();
  return /^return\s+reflect\.DeepEqual\([A-Za-z_][A-Za-z0-9_]*,\s*expected\)$/.test(consumer)
    || /^legacy\s*=\s*legacySeedTimestampsMatch\(item\.CreatedAt,\s*item\.UpdatedAt\)\s*&&\s*reflect\.DeepEqual\(item,\s*expected\)$/.test(consumer)
    || /^legacy\s*=\s*item\.(?:CreatedAt|UpdatedAt)\s*!=\s*""\s*&&\s*reflect\.DeepEqual\(item,\s*expected\)$/.test(consumer)
    || /^legacy\s*=\s*legacySeedTimestampsMatch\(item\.CreatedAt,\s*item\.UpdatedAt\)\s*&&\s*legacyReportMatches\(item,\s*expected\)$/.test(consumer)
    || /^legacy\s*=\s*legacySeedTimestampsMatch\(item\.CreatedAt,\s*item\.UpdatedAt\)\s*&&\s*legacyKnowledgeDocumentMatches\(item,\s*expected,\s*\[\]string\{[^{}]*\}\)$/.test(consumer);
}

function isPureMaterialFingerprintEntry(lines, index, functionRange) {
  const line = lines[index];
  if (!/^\s*["'][^"']+["']\s*:\s*\{.*\}\s*,?\s*$/.test(line)) return false;
  if (/\b[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(line)) return false;
  let mapStart = -1;
  for (let lineIndex = index - 1; lineIndex >= functionRange.start; lineIndex -= 1) {
    if (/^\s*expected\s*:=\s*map\[string\]WorkbenchProjectMaterialView\s*\{\s*$/.test(lines[lineIndex])) {
      mapStart = lineIndex;
      break;
    }
  }
  if (mapStart < 0) return false;
  let balance = 0;
  let mapEnd = -1;
  for (let lineIndex = mapStart; lineIndex <= functionRange.end; lineIndex += 1) {
    balance += (lines[lineIndex].match(/\{/g) ?? []).length;
    balance -= (lines[lineIndex].match(/\}/g) ?? []).length;
    if (balance === 0) {
      mapEnd = lineIndex;
      break;
    }
  }
  if (mapEnd < index) return false;
  const tail = lines.slice(mapEnd + 1, functionRange.end + 1);
  const expectedUses = tail.filter((candidate) => /\bexpected\b/.test(candidate));
  const fingerprintUses = tail.filter((candidate) => /\bfingerprint\b/.test(candidate));
  return expectedUses.length === 1
    && /^\s*fingerprint,\s*ok\s*:=\s*expected\[strings\.TrimSpace\(material\.ID\)\]\s*$/.test(expectedUses[0])
    && fingerprintUses.length === 2
    && fingerprintUses.some((candidate) => /^\s*return\s+ok\s*&&\s*reflect\.DeepEqual\(material,\s*fingerprint\)\s*$/.test(candidate));
}

function lineAllowsLegacyCleanup(relative, lines, index) {
  const hasMarker = lines[index].includes(RUNTIME_MOCK_ALLOW_MARKER)
    || (index > 0 && lines[index - 1].includes(RUNTIME_MOCK_ALLOW_MARKER));
  if (!hasMarker) return false;
  const allowedFunctions = legacyCleanupFunctionsByFile.get(relative);
  const functionRange = enclosingGoFunctionRange(lines, index);
  if (!functionRange || !allowedFunctions?.has(functionRange.name)) return false;
  return isPureExpectedFingerprint(lines, index, functionRange)
    || isPureMaterialFingerprintEntry(lines, index, functionRange);
}

function locationForOffset(content, offset) {
  const before = content.slice(0, offset);
  const line = before.split('\n').length;
  const lineStart = before.lastIndexOf('\n');
  return { line, column: offset - lineStart };
}

export async function scanRuntimeMocks({ root = repositoryRoot } = {}) {
  const findings = [];
  for (const file of await productionFiles(root)) {
    const relative = normalizedRelativePath(root, file);
    const content = await readFile(file, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const decoded = decodeUnicodeEscapes(lines[index]);
      for (const rule of lineRules) {
        if (rule.pathPrefix && !relative.startsWith(rule.pathPrefix)) continue;
        const match = decoded.match(rule.pattern);
        if (!match) continue;
        if (rule.allowLegacyCleanup && lineAllowsLegacyCleanup(relative, lines, index)) continue;
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
    for (const rule of contentRules) {
      if (rule.files && !rule.files.has(relative)) continue;
      rule.pattern.lastIndex = 0;
      for (const match of content.matchAll(rule.pattern)) {
        const location = locationForOffset(content, match.index ?? 0);
        findings.push({
          rule: rule.id,
          message: rule.message,
          file: relative,
          line: location.line,
          column: location.column,
          match: match[0].replace(/\s+/g, ' ').slice(0, 180),
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
  } else if (findings.length === 0) {
    console.log('Runtime mock gate passed: no production mock fingerprints found.');
  } else {
    console.error(`Runtime mock gate failed: ${findings.length} production fingerprint(s).`);
    for (const finding of findings) {
      console.error(`${finding.file}:${finding.line}:${finding.column} [${finding.rule}] ${finding.message} (${finding.match})`);
    }
    console.error(`\nLegacy cleanup-only literals may be annotated with: ${RUNTIME_MOCK_ALLOW_MARKER}`);
  }
  if (findings.length > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) await main();
