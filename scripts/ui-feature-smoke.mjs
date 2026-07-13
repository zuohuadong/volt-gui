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

async function assertCount(locator, expected, label) {
  const count = await locator.count();
  if (count !== expected) throw new Error(`${label}: expected ${expected}, got ${count}`);
}

async function assertBackendUnavailableNotice(page, action) {
  const notice = page.locator('.workbench-notice').last();
  await notice.waitFor({ state: 'visible', timeout: 5000 });
  const text = (await notice.innerText()).trim();
  if (!/未连接桌面后端|Wails 桌面运行环境|桌面端.*重试|桌面后端.*不可用/.test(text)) {
    throw new Error(`${action}: expected honest backend-unavailable notice, got ${JSON.stringify(text)}`);
  }
}

async function openUserMenuItem(page, item) {
  await closeOverlays(page);
  const opener = await firstVisible(page.getByRole('button', { name: '打开用户菜单', exact: true }), 'user menu button');
  await opener.click({ force: true });
  const menuItem = await firstVisible(page.getByRole('menuitem', { name: item, exact: true }), `user menu item ${item}`);
  await menuItem.click({ force: true });
  await page.waitForTimeout(100);
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
    await assertText(page, label === '自动化' ? '自动化任务' : label.replace('事项', ''), label);
  }
}

async function smokeNoSeedContent(page) {
  await clickButton(page, 'Work 工作台', { exact: true });
  await clickButton(page, '今日概览', { exact: true });
  await page.waitForTimeout(500);
  const body = await page.locator('body').innerText();
  const forbidden = [
    'Volt GUI 桌面端重构',
    '内部研发团队',
    'Lurefree 小程序发布',
    '品牌主页恢复与部署',
    '产品研发组',
    '最近一次通过',
    '128 次运行',
    '64%',
  ];
  for (const text of forbidden) {
    if (body.includes(text)) throw new Error(`browser preview still renders mock fingerprint: ${text}`);
  }
}

async function smokeEmptyBusinessSurfaces(page) {
  const checks = [
    ['待办事项', '.aorist-page .aorist-list > article:not(.detail-empty)', 'todo records'],
    ['自动化', '.automation-task-card', 'automation records'],
    ['项目管理', '.project-matter-card', 'project records'],
    ['客户管理', '.client-card', 'customer records'],
    ['日程日历', '.calendar-event-chip, .calendar-board aside .automation-row', 'calendar records'],
    ['报告中心', '.report-card-list > button', 'report records'],
    ['资料中心', '.resource-category-card, .knowledge-template-card', 'resource records'],
    ['团队协作', '.team-list-card', 'team records'],
    ['Agent 中心', '.agent-grid .agent-card', 'agent records'],
    ['能力中心', '.capability-row', 'capability records'],
  ];
  for (const [nav, selector, label] of checks) {
    await clickButton(page, nav);
    await assertCount(page.locator(selector), 0, label);
  }

  for (const item of ['同步中心', '操作记录']) {
    await openUserMenuItem(page, item);
    await assertCount(page.locator('.aorist-page .aorist-list > article:not(.detail-empty)'), 0, `${item} records`);
    await closeOverlays(page);
  }
}

async function smokeReachableDialogs(page) {
  const dialogOpeners = [
    ['待办事项', '新增待办', '新建待办'],
    ['日程日历', '新建日程', '新建日程'],
    ['报告中心', '新建报告', '新建分析报告'],
    ['资料中心', '上传资料', '上传资料'],
    ['资料中心', '批量导入', '批量导入'],
    ['团队协作', /配置新组|点击开始配置第一组/, '配置 Agent 团队'],
    ['项目管理', '新建项目', '新建项目'],
    ['客户管理', '新建客户', '新建客户'],
  ];
  for (const [nav, opener, title] of dialogOpeners) {
    await closeOverlays(page);
    await clickButton(page, nav);
    await clickButton(page, opener);
    await assertText(page, title);
    await closeOverlays(page);
  }

  await clickButton(page, 'Agent 中心');
  await clickButton(page, '创建 Agent');
  await assertText(page, '创建与配置 Agent');
  await closeOverlays(page);

  await clickButton(page, '资料中心');
  await clickButton(page, '知识库', { exact: true });
  await clickButton(page, '新建规范', { exact: true });
  await assertText(page, '新建规范');
  await closeOverlays(page);

  await clickButton(page, '能力中心');
  await firstVisible(page.getByRole('button', { name: '导入能力配置', exact: true }), 'button 导入能力配置');
  await assertCount(page.locator('input[aria-label="导入能力配置文件"]'), 1, 'capability import input');
  await clickButton(page, '导入 MCP 配置', { exact: true });
  await assertText(page, '导入 MCP 配置');
  await closeOverlays(page);
}

async function smokeUnboundWritesAndRun(page) {
  const hasBindings = await page.evaluate(() => Boolean(window.go?.main?.App));
  if (hasBindings) throw new Error('browser-preview smoke unexpectedly has Wails bindings');

  await clickButton(page, '待办事项');
  const todoRows = page.locator('.aorist-page .aorist-list > article:not(.detail-empty)');
  const beforeTodos = await todoRows.count();
  await clickButton(page, '新增待办');
  const todoModal = page.locator('.config-modal').last();
  await todoModal.locator('input[placeholder*="跟进客户反馈"]').fill('浏览器预览不可落库待办');
  await clickScopedButton(todoModal, '确认', { exact: true });
  await assertBackendUnavailableNotice(page, 'save todo');
  await closeOverlays(page);
  await clickButton(page, '待办事项');
  await assertCount(todoRows, beforeTodos, 'unbound todo save must not mutate records');

  await clickButton(page, '项目管理');
  const projectRows = page.locator('.project-matter-card');
  const beforeProjects = await projectRows.count();
  await clickButton(page, '新建项目');
  const projectModal = page.locator('.config-modal').last();
  await projectModal.locator('input[placeholder*="客户门户上线"]').fill('浏览器预览不可落库项目');
  await clickScopedButton(projectModal, '确认', { exact: true });
  await assertBackendUnavailableNotice(page, 'save project');
  await closeOverlays(page);
  await clickButton(page, '项目管理');
  await assertCount(projectRows, beforeProjects, 'unbound project save must not mutate records');

  await clickButton(page, '日程日历');
  const eventRows = page.locator('.calendar-event-chip, .calendar-board aside .automation-row');
  const beforeEvents = await eventRows.count();
  await clickButton(page, '同步', { exact: true });
  await assertBackendUnavailableNotice(page, 'run calendar sync');
  await assertCount(eventRows, beforeEvents, 'unbound sync must not fabricate records');
}

async function smokeComposerDoesNotFakeAssistant(page) {
  await clickButton(page, '新建任务');
  const input = page.getByTestId('composer-input');
  const inputVisible = await input.isVisible().catch(() => false);
  if (!inputVisible) {
    const body = await page.locator('body').innerText();
    if (/尚未配置.*Agent|请先创建.*Agent|未连接桌面后端|Wails 桌面运行环境/.test(body)) return;
    throw new Error('new task has neither a composer nor an honest empty/unavailable explanation');
  }
  if (await input.isDisabled()) {
    const body = await page.locator('body').innerText();
    if (!/未连接|不可用|桌面后端|Wails/.test(body)) throw new Error('disabled composer does not explain the unavailable desktop backend');
    return;
  }
  const assistantMessages = page.locator('.transcript .message--assistant');
  const before = await assistantMessages.count();
  await input.fill('浏览器预览不能伪造模型回复');
  await submitComposer(page);
  await page.waitForTimeout(250);
  const after = await assistantMessages.count();
  if (after !== before) throw new Error(`unbound composer fabricated ${after - before} assistant message(s)`);
  const body = await page.locator('body').innerText();
  if (body.includes('浏览器预览已收到这条消息')) throw new Error('legacy fake assistant reply is still visible');
}

async function smokeUserPanels(page) {
  for (const item of ['模型管理', '系统设置']) {
    await openUserMenuItem(page, item);
    await assertText(page, item);
    if (item === '模型管理') await assertText(page, '未连接桌面后端');
    await closeOverlays(page);
  }
}

async function smokeVisibleProbe(page) {
  await clickButton(page, 'Work 工作台').catch(() => {});
  await clickButton(page, '今日概览');
  const before = await collectVisibleControls(page);
  for (const pattern of [/^查看全部$/, /^管理$/, /^新建待办$/, /^新建日程$/, /^进入 Agent 中心$/, /^Work$/, /^Code$/]) {
    if (!before.some((control) => pattern.test(control.name))) continue;
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
    if (msg.type() === 'error') errors.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  await runStep(page, errors, `${label} initial honest-unbound load`, async () => {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.locator('.shell').waitFor({ state: 'visible', timeout: 15000 });
    await firstVisible(page.getByRole('button', { name: 'Work 工作台', exact: true }), 'Work 工作台 switch');
  });
  await runStep(page, errors, `${label} no seeded business content`, () => smokeNoSeedContent(page));
  await runStep(page, errors, `${label} work navigation`, () => smokeWorkNavigation(page));
  await runStep(page, errors, `${label} empty business surfaces`, () => smokeEmptyBusinessSurfaces(page));
  await runStep(page, errors, `${label} real feature dialogs remain reachable`, () => smokeReachableDialogs(page));
  await runStep(page, errors, `${label} unbound writes and run stay non-mutating`, () => smokeUnboundWritesAndRun(page));
  await runStep(page, errors, `${label} unbound composer has no fake assistant`, () => smokeComposerDoesNotFakeAssistant(page));
  await runStep(page, errors, `${label} backend-dependent user panels are honest`, () => smokeUserPanels(page));
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
  mode: 'browser-preview-honest-empty-and-unbound-safety',
  limitation: 'This browser run verifies honest empty state plus non-mutating unbound writes/runs. Delete and durable CRUD semantics are enforced by the runtime-mock source gate and scripts/workbench-crud-smoke.mjs against temporary Go profiles.',
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
