#!/usr/bin/env node
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split('=');
  return [key, rest.join('=') || '1'];
}));

function loadPlaywright() {
  const candidates = [...new Set([
    args.get('--playwright-module'),
    process.env.VOLT_GUI_PLAYWRIGHT_MODULE,
    'playwright',
    '/tmp/volt-gui-pw/node_modules/playwright',
  ].filter(Boolean))];
  for (const candidate of candidates) {
    try {
      return { api: require(candidate), source: candidate };
    } catch {
      // Try the next local/runtime install location.
    }
  }
  throw new Error(`Playwright is not available. Tried: ${candidates.join(', ')}. Install it or pass --playwright-module=/absolute/path/to/playwright.`);
}

const { api: playwright, source: playwrightSource } = loadPlaywright();
const { chromium } = playwright;

const baseURL = args.get('--target') || process.env.VOLT_GUI_SMOKE_URL || 'http://127.0.0.1:5174/';
const outDir = args.get('--out') || path.resolve('output/playwright/volt-gui-ui-feature-smoke');
const headed = args.has('--headed');
const results = [];
const runStartedAt = new Date().toISOString();

await mkdir(outDir, { recursive: true });

function safeName(name) {
  return name.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 110) || 'step';
}

function record(name, ok, details = '', meta = {}) {
  const item = { name, ok, details, ...meta };
  results.push(item);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${details ? ` - ${details}` : ''}`);
}

async function visibleCount(locator) {
  const count = await locator.count();
  let visible = 0;
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) visible += 1;
  }
  return visible;
}

async function firstVisible(locator, label) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    if (await item.isVisible().catch(() => false)) return item;
  }
  throw new Error(`missing visible ${label}`);
}

async function clickButton(page, name, options = {}) {
  const locator = page.getByRole('button', { name, exact: options.exact ?? false });
  const button = await firstVisible(locator, `button ${String(name)}`);
  await button.click({ timeout: options.timeout ?? 5000 });
  await page.waitForTimeout(options.pause ?? 100);
}

async function clickScopedButton(scope, name, options = {}) {
  const locator = scope.getByRole('button', { name, exact: options.exact ?? false });
  const button = await firstVisible(locator, `scoped button ${String(name)}`);
  await button.click({ timeout: options.timeout ?? 5000 });
  await scope.page().waitForTimeout(options.pause ?? 100);
}

async function clickText(page, text, options = {}) {
  const locator = page.getByText(text, { exact: options.exact ?? false });
  const item = await firstVisible(locator, `text ${String(text)}`);
  await item.click({ timeout: options.timeout ?? 5000 });
  await page.waitForTimeout(options.pause ?? 100);
}

async function fillFirst(page, selector, value, label = selector) {
  const locator = await firstVisible(page.locator(selector), label);
  await locator.fill(value);
  await page.waitForTimeout(50);
}

async function submitComposer(page) {
  const activeComposer = page.locator('form.composer:has([data-testid="composer-input"])').first();
  const sendButton = activeComposer.locator('button[type="submit"]').first();
  await sendButton.waitFor({ state: 'visible', timeout: 90000 });
  await sendButton.click({ timeout: 5000 });
  await page.waitForTimeout(100);
}

async function assertText(page, text, label = text) {
  const count = await visibleCount(page.getByText(text, { exact: false }));
  if (count < 1) throw new Error(`${label} not visible`);
}

async function assertHealthy(page, label) {
  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  if (!bodyText.trim()) throw new Error(`${label}: blank page`);
  for (const bad of ['Application error', 'Unhandled Runtime Error']) {
    if (bodyText.includes(bad)) throw new Error(`${label}: page shows ${bad}`);
  }
  const blockingOverlay = await visibleCount(page.locator('.agent-selector__scrim'));
  if (blockingOverlay > 1) throw new Error(`${label}: multiple blocking scrims visible`);
}

async function closeOverlays(page) {
  for (let index = 0; index < 5; index += 1) {
    const modalCount = await visibleCount(page.locator('.modal-backdrop, .agent-wizard, .config-modal, .agent-market-modal, .capability-detail-modal, .user-panel-dialog, .code-inspector'));
    const menuCount = await visibleCount(page.locator('.user-menu, .agent-selector__menu'));
    if (modalCount === 0 && menuCount === 0) break;
    const closeByName = page.getByRole('button', { name: /^(关闭|取消|返回项目列表|返回客户列表|x|×)$/ }).last();
    const closeByText = page.locator('button').filter({ hasText: /^x$|^×$|关闭|取消|返回项目列表|返回客户列表/ }).last();
    if (await closeByName.isVisible().catch(() => false)) await closeByName.click().catch(() => {});
    else if (await closeByText.isVisible().catch(() => false)) await closeByText.click().catch(() => {});
    else await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(120);
  }
}

async function runStep(page, errors, name, fn) {
  const startErrorCount = errors.length;
  try {
    await fn();
    await assertHealthy(page, name);
    const screenshot = `${outDir}/${safeName(name)}.png`;
    await page.screenshot({ path: screenshot, fullPage: false });
    const newErrors = errors.slice(startErrorCount).filter((line) => !line.includes('Failed to load resource'));
    if (newErrors.length) throw new Error(`console/page errors: ${newErrors.join(' | ')}`);
    record(name, true, '', { screenshot });
  } catch (error) {
    const screenshot = `${outDir}/failed-${String(results.length + 1).padStart(2, '0')}-${safeName(name)}.png`;
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    record(name, false, error instanceof Error ? error.message : String(error), { screenshot });
    await closeOverlays(page).catch(() => {});
  }
}

async function collectVisibleControls(page) {
  return page.evaluate(() => {
    function labelFor(el) {
      return (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim();
    }
    return [...document.querySelectorAll('button, [role="button"], [role="menuitem"], input, textarea, select')]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map((el) => ({ tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', name: labelFor(el).slice(0, 160) }))
      .filter((item) => item.name || ['input', 'textarea', 'select'].includes(item.tag));
  });
}

async function smokeWorkNavigation(page) {
  const navLabels = ['今日概览', '新建任务', '待办事项', '自动化', '项目管理', '客户管理', '资料中心', '团队协作', '日程日历', '报告中心', 'Agent 中心', '能力中心'];
  for (const label of navLabels) {
    await clickButton(page, label);
    await assertText(page, label === '新建任务' ? '选一个对话模板' : label.replace('事项', ''));
  }
}

async function smokeSidebar(page) {
  await clickButton(page, /项目排序/);
  await clickButton(page, /项目排序/);
  await clickButton(page, /收起项目|展开项目/);
  await clickButton(page, /收起项目|展开项目/);
  await clickButton(page, /展开 Lurefree|收起 Lurefree/);
  await clickButton(page, /展开 Lurefree|收起 Lurefree/);
  await clickButton(page, /在 Volt GUI 桌面端重构 下新建对话/);
  await assertText(page, '新建对话');
  await clickButton(page, /修改 Volt GUI 桌面端重构 任务名称/);
  const renameInput = page.locator('.sidebar-project-inline-rename input').first();
  if (await renameInput.isVisible().catch(() => false)) {
    await renameInput.fill('Volt GUI 桌面端重构');
    await renameInput.press('Enter');
  }
}

async function smokeHomeCards(page) {
  await clickButton(page, '今日概览', { exact: true });
  await clickButton(page, '查看全部', { exact: true });
  await assertText(page, '待办事项');
  await clickButton(page, '今日概览', { exact: true });
  await clickButton(page, '管理', { exact: true });
  await assertText(page, /自动化任务|新建自动化任务/, '自动化任务');
  await clickButton(page, '今日概览', { exact: true });
  await clickButton(page, '新建待办', { exact: true });
  await assertText(page, '新建待办');
  await closeOverlays(page);
  await clickButton(page, '新建日程', { exact: true });
  await assertText(page, '新建日程');
  await closeOverlays(page);
}

async function smokeUserPanels(page) {
  for (const item of ['模型管理', '系统设置', '同步中心', '操作记录']) {
    await clickButton(page, '打开用户菜单');
    await page.getByRole('menuitem', { name: item, exact: true }).click();
    await page.waitForTimeout(150);
    await assertText(page, item);
    if (item === '系统设置') {
      for (const tab of ['通用', '外观', '权限', '运行时', '模型']) {
        const tabButton = page.getByRole('button', { name: tab, exact: false }).first();
        if (await tabButton.isVisible().catch(() => false)) await tabButton.click();
      }
    }
    await closeOverlays(page);
  }
}

async function smokeConfigDialogs(page) {
  const dialogOpeners = [
    ['待办事项', '新增待办', '新建待办'],
    ['日程日历', '新建日程', '新建日程'],
    ['报告中心', '新建报告', '新建分析报告'],
    ['资料中心', '上传资料', '上传资料'],
    ['资料中心', '批量导入', '批量导入'],
    ['团队协作', '配置新组', '配置 Agent 团队'],
    ['项目管理', '新建项目', '新建项目'],
    ['客户管理', '新建客户', '新建客户'],
  ];
  for (const [nav, opener, title] of dialogOpeners) {
    await clickButton(page, nav);
    await clickButton(page, opener);
    await assertText(page, title);
    await closeOverlays(page);
  }

  await clickButton(page, '能力中心');
  await firstVisible(page.getByRole('button', { name: '导入能力配置', exact: true }), 'button 导入能力配置');
  const capabilityInput = page.locator('input[aria-label="导入能力配置文件"]');
  if (await capabilityInput.count() !== 1) throw new Error('missing capability import file input');
  await clickButton(page, '导入 MCP 配置', { exact: true });
  await assertText(page, '导入 MCP 配置');
  await closeOverlays(page);
}

async function smokeProjectsAndCustomers(page) {
  await clickButton(page, '项目管理');
  await fillFirst(page, 'input[placeholder*="搜索项目"]', 'volt', 'project search');
  await clickButton(page, '全部');
  await clickButton(page, '进行中');
  await clickButton(page, '已归档');
  await clickButton(page, '全部');
  await firstVisible(page.locator('.project-matter-card').filter({ hasText: 'Volt GUI 桌面端重构' }), 'project card').then((card) => card.click());
  await assertText(page, '项目概览');
  const projectModal = page.locator('.project-detail-modal').first();
  await projectModal.waitFor({ state: 'visible', timeout: 5000 });
  for (const tab of [/^资料 \(\d+\)$/, /^日程 \(\d+\)$/, /^报告 \(\d+\)$/, /^待办$/, /^概览$/]) {
    await clickScopedButton(projectModal, tab);
  }
  await closeOverlays(page);

  await clickButton(page, '客户管理');
  await fillFirst(page, 'input[placeholder*="搜索客户"]', '内部', 'customer search');
  await firstVisible(page.locator('.client-card').filter({ hasText: '内部研发团队' }), 'customer card').then((card) => card.click());
  await assertText(page, '客户画像');
  const customerModal = page.locator('.customer-detail-modal').first();
  await customerModal.waitFor({ state: 'visible', timeout: 5000 });
  for (const tab of [/^项目 \(\d+\)$/, /^资料 \(\d+\)$/, /^日程 \(\d+\)$/, /^待办 \(\d+\)$/, /^概览$/]) {
    await clickScopedButton(customerModal, tab);
  }
  await closeOverlays(page);
}

async function smokeResources(page) {
  await clickButton(page, '资料中心');
  for (const tab of ['资料库', '知识库', '全文检索', '对话归档', '导入中心']) {
    await clickButton(page, tab, { exact: true });
    await assertText(page, tab === '资料库' ? '资料库' : tab);
  }
  await clickButton(page, '资料库', { exact: true });
  await fillFirst(page, 'input[aria-label="检索资料库"]', '项目', 'resource search');
  await fillFirst(page, 'input[aria-label="检索资料库"]', '', 'resource search clear');
  await clickButton(page, '知识库', { exact: true });
  await clickButton(page, '新建模板');
  await assertText(page, '新建文档模板');
  await closeOverlays(page);
  await clickButton(page, '导入中心', { exact: true });
  await clickButton(page, '查看失败');
}

async function smokeTeams(page) {
  await clickButton(page, '团队协作');
  await clickButton(page, '运行台');
  await clickButton(page, '刷新运行态');
  for (const control of ['继续', '暂停', '人工复核']) {
    const button = page.getByRole('button', { name: control, exact: false }).first();
    if (await button.isVisible().catch(() => false)) await button.click();
  }
  await clickButton(page, '团队模板');
  await firstVisible(page.locator('.team-card-meta button').filter({ hasText: '创建运行' }), 'team create run').then((button) => button.click());
  await firstVisible(page.locator('.team-compose-row textarea[placeholder*="向协作组发送任务"]'), 'team chat composer');
  await fillFirst(page, '.team-compose-row textarea', '请创建一次本地协作运行草稿', 'team composer');
  await clickButton(page, '发送', { exact: true, pause: 400 });
  await assertText(page, '团队 runtime 未连接，请在 Wails 桌面环境中重试。');
  await clickButton(page, '上传文件');
  await clickButton(page, '返回团队大厅');
}

async function smokeAgents(page) {
  await clickButton(page, 'Agent 中心');
  await fillFirst(page, 'input[aria-label="搜索 Agent"]', '代码', 'agent search');
  await fillFirst(page, 'input[aria-label="搜索 Agent"]', '', 'agent search clear');
  await clickButton(page, 'Agent 市场');
  await assertText(page, 'Agent 市场');
  await fillFirst(page, 'input[aria-label="搜索 Agent 市场"]', '审查', 'agent market search');
  const marketModal = page.locator('.agent-market-modal').first();
  await marketModal.waitFor({ state: 'visible', timeout: 5000 });
  const save = await firstVisible(marketModal.getByRole('button', { name: /保存本地模板|已保存/, exact: false }), 'market agent save state');
  if ((await save.innerText()).includes('保存本地模板')) await save.click();
  await firstVisible(marketModal.getByRole('button', { name: /已保存/, exact: false }), 'saved market agent');
  await closeOverlays(page);
  await clickButton(page, '蒸馏 Agent');
  for (const step of ['2. 提炼能力', '3. 生成 Agent', '1. 选择样本']) await clickButton(page, step);
  await closeOverlays(page);
  await clickButton(page, '创建 Agent');
  for (const tab of ['助手特征', '基础工具', '业务技能', '核心文件']) await clickButton(page, tab);
  await closeOverlays(page);
}

async function smokeCapabilities(page) {
  await clickButton(page, '能力中心');
  for (const tab of ['插件模块', 'MCP 连接', 'Skill 包']) {
    await clickButton(page, tab);
    await fillFirst(page, '.capability-search input', 'git', 'capability search');
    await fillFirst(page, '.capability-search input', '', 'capability search clear');
    await clickButton(page, /添加|创建/);
    await assertText(page, /新建|创建|添加/);
    await closeOverlays(page);
  }
  await clickButton(page, '插件模块');
  const row = page.locator('.capability-row').first();
  if (await row.isVisible().catch(() => false)) {
    await row.click();
    await assertText(page, '安装与连接流程');
    const binding = page.locator('.capability-agent-binding button').first();
    if (await binding.isVisible().catch(() => false)) await binding.click();
    await closeOverlays(page);
  }
}

async function smokeComposer(page) {
  await clickButton(page, '新建任务');
  await clickButton(page, 'Code 工作台');
  await clickButton(page, 'Work 工作台');
  await clickButton(page, '新建任务');
  const input = page.getByTestId('composer-input');
  await input.fill('检查所有功能是否可点击');
  const plus = page.locator('.composer button').filter({ hasText: /^$/ }).first();
  if (await plus.isVisible().catch(() => false)) await plus.click().catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await submitComposer(page);
  await assertText(page, '检查所有功能是否可点击');
}

async function smokeCodeWorkbench(page) {
  await clickButton(page, 'Code 工作台');
  await assertText(page, '面向研发的代码工作台');
  for (const panel of ['总览', 'Workspace / Preview', 'Context', 'Diff', 'Checkpoints']) {
    await clickButton(page, panel);
  }
  for (const action of ['代码状态', '上下文窗口', '变更审查', '检查点']) {
    await clickButton(page, action);
  }
  await clickButton(page, '模型渠道');
  await assertText(page, '模型');
  await closeOverlays(page);
  await clickButton(page, '权限沙箱');
  await assertText(page, '权限');
  await closeOverlays(page);
  await clickButton(page, '开始代码对话');
  const input = page.getByTestId('composer-input');
  await input.fill('解释当前 diff');
  await submitComposer(page);
  await assertText(page, '解释当前 diff');
  await clickButton(page, 'Work 工作台');
  await assertText(page, '今日概览');
}

async function smokeVisibleProbe(page) {
  await clickButton(page, 'Work 工作台').catch(() => {});
  await clickButton(page, '今日概览');
  const before = await collectVisibleControls(page);
  const safePatterns = [/^查看全部$/, /^管理$/, /^新建待办$/, /^新建日程$/, /^进入 Agent 中心$/, /^Work$/, /^Code$/];
  for (const pattern of safePatterns) {
    const item = before.find((control) => pattern.test(control.name));
    if (!item) continue;
    await clickButton(page, pattern);
    await closeOverlays(page);
    await clickButton(page, '今日概览').catch(() => {});
  }
  const after = await collectVisibleControls(page);
  return { beforeCount: before.length, afterCount: after.length, sample: after.slice(0, 30) };
}

async function smokeViewport(label, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', (msg) => {
    if (['error'].includes(msg.type())) errors.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  await runStep(page, errors, `${label} initial load`, async () => {
    await page.goto(baseURL, { waitUntil: 'load' });
    await page.locator('.shell').waitFor({ state: 'visible', timeout: 15000 });
    await firstVisible(page.getByRole('button', { name: 'Work 工作台', exact: true }), 'Work 工作台 switch');
  });
  await runStep(page, errors, `${label} sidebar project controls`, () => smokeSidebar(page));
  await runStep(page, errors, `${label} work navigation`, () => smokeWorkNavigation(page));
  await runStep(page, errors, `${label} home cards and create dialogs`, () => smokeHomeCards(page));
  await runStep(page, errors, `${label} user menu panels`, () => smokeUserPanels(page));
  await runStep(page, errors, `${label} config dialogs`, () => smokeConfigDialogs(page));
  await runStep(page, errors, `${label} projects and customers`, () => smokeProjectsAndCustomers(page));
  await runStep(page, errors, `${label} resources center`, () => smokeResources(page));
  await runStep(page, errors, `${label} teams flow`, () => smokeTeams(page));
  await runStep(page, errors, `${label} agents flow`, () => smokeAgents(page));
  await runStep(page, errors, `${label} capabilities flow`, () => smokeCapabilities(page));
  await runStep(page, errors, `${label} composer flow`, () => smokeComposer(page));
  await runStep(page, errors, `${label} code workbench`, () => smokeCodeWorkbench(page));
  await runStep(page, errors, `${label} visible safe-click probe`, async () => {
    const meta = await smokeVisibleProbe(page);
    record(`${label} visible controls enumerated`, true, `${meta.beforeCount} before / ${meta.afterCount} after`, { controls: meta.sample });
  });
  await page.close();
}

function systemChromeExecutable() {
  const configured = args.get('--chrome-executable') || process.env.VOLT_GUI_CHROME_EXECUTABLE;
  const candidates = [
    configured,
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '',
    process.platform === 'darwin' ? '/Applications/Chromium.app/Contents/MacOS/Chromium' : '',
    process.platform === 'linux' ? '/usr/bin/google-chrome' : '',
    process.platform === 'linux' ? '/usr/bin/chromium' : '',
    process.platform === 'win32' && process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe') : '',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

async function launchSmokeBrowser() {
  const mode = args.get('--browser') || process.env.VOLT_GUI_SMOKE_BROWSER || 'auto';
  if (!['auto', 'playwright', 'system-chrome'].includes(mode)) {
    throw new Error(`Unsupported browser mode: ${mode}. Use auto, playwright, or system-chrome.`);
  }

  if (mode !== 'system-chrome') {
    try {
      return {
        instance: await chromium.launch({ headless: !headed }),
        source: 'Playwright-managed Chromium',
      };
    } catch (error) {
      if (mode === 'playwright') throw error;
      console.warn(`Playwright-managed Chromium unavailable; trying isolated system Chrome: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const executablePath = systemChromeExecutable();
  if (!executablePath) {
    throw new Error('No system Chrome fallback found. Install Playwright Chromium or pass --chrome-executable=/absolute/path.');
  }
  return {
    instance: await chromium.launch({ headless: !headed, executablePath }),
    source: `system Chrome via Playwright temporary profile (${executablePath})`,
  };
}

const { instance: browser, source: browserSource } = await launchSmokeBrowser();
try {
  await smokeViewport('desktop', { width: 1440, height: 950 });
  await smokeViewport('mobile', { width: 390, height: 844 });
} finally {
  await browser.close();
}

const summary = {
  runStartedAt,
  runFinishedAt: new Date().toISOString(),
  target: baseURL,
  outDir,
  playwrightSource,
  browserSource,
  mode: 'browser-preview-ui-reachability',
  limitation: 'This smoke verifies rendered UI reachability/click safety in browser preview. Wails-bound side effects are verified by Go/Wails tests, not by this browser-only run.',
  total: results.length,
  passed: results.filter((item) => item.ok).length,
  failed: results.filter((item) => !item.ok).length,
  results,
};

await writeFile(`${outDir}/ui-feature-smoke-results.json`, JSON.stringify(summary, null, 2));

if (summary.failed > 0) {
  console.error(`\n${summary.failed} UI feature smoke step(s) failed. Results: ${outDir}/ui-feature-smoke-results.json`);
  process.exit(1);
}

console.log(`\nUI feature smoke passed: ${summary.passed}/${summary.total}. Results: ${outDir}/ui-feature-smoke-results.json`);
