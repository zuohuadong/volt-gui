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
    const modalCount = await visibleCount(page.locator('.modal-backdrop, .agent-wizard, .config-modal, .agent-market-modal, .capability-detail-modal, .user-panel-modal, .code-inspector'));
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

async function smokeNoSeedContent(page, mobile) {
  await clickUnifiedNav(page, '工作台', mobile);
  await page.waitForTimeout(500);
  const body = await page.locator('body').innerText();
  const forbidden = [
    'E2E 发布验收任务',
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

function receiptTestFixture() {
  const now = '2026-07-13T08:00:00.000Z';
  const section = (status, items, note) => ({ status, items, note });
  return {
    version: 2,
    savedWorkspaces: [],
    projectTasks: [],
    inboxTasks: [{
      id: '__e2e_result_task__',
      title: 'E2E 发布验收任务',
      updatedAt: '刚刚',
      updatedAtMs: Date.parse(now),
      templateId: 'release-acceptance',
      transcript: [{ id: '__e2e_user__', role: 'user', body: '执行发布验收并保留可核验证据。', createdAtMs: Date.parse(now) }],
      receipt: {
        id: '__e2e_receipt__',
        taskId: '__e2e_result_task__',
        templateId: 'release-acceptance',
        state: 'pending-review',
        createdAt: now,
        updatedAt: now,
        sections: {
          goal: section('ready', ['发布验收'], '来自任务结果模板'),
          runtime: section('ready', ['收件箱项目'], '运行上下文已记录'),
          changes: section('pending', [], '等待实际变更证据'),
          verification: section('pending', [], '等待验证证据与人工复核'),
          artifacts: section('pending', [], '等待产物路径'),
          dataPath: section('pending', [], '等待数据路径记录'),
          rollback: section('pending', [], '等待回滚方案'),
        },
      },
    }, {
      id: '__e2e_archived_task__',
      title: 'E2E 已归档任务',
      updatedAt: '已归档',
      updatedAtMs: Date.parse(now) - 60_000,
      archivedAtMs: Date.parse(now) - 30_000,
      transcript: [{ id: '__e2e_archived_user__', role: 'user', body: '保留用于归档恢复验证。', createdAtMs: Date.parse(now) - 60_000 }],
    }],
    activeWorkspaceId: '',
    activeProjectId: 'inbox',
    activeTaskId: '__e2e_result_task__',
    projectSort: 'recent',
    projectDockCollapsed: false,
  };
}

async function openUnifiedDrawerIfNeeded(page, mobile) {
  if (!mobile) return;
  const drawer = page.locator('[data-testid="unified-sidebar"]');
  if (!(await drawer.evaluate((node) => node.classList.contains('drawer-open')).catch(() => false))) {
    await clickButton(page, '打开导航抽屉', { exact: true });
  }
  await drawer.waitFor({ state: 'visible', timeout: 5000 });
  if (!(await drawer.evaluate((node) => node.classList.contains('drawer-open')))) {
    throw new Error('mobile unified navigation drawer did not open');
  }
  await page.waitForTimeout(320);
  const rect = await drawer.evaluate((node) => {
    const value = node.getBoundingClientRect();
    return { left: value.left, width: value.width, viewport: window.innerWidth, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
  });
  const minimumWidth = Math.min(rect.viewport * 0.75, 280);
  if (rect.width < minimumWidth || Math.abs(rect.left) > 2) {
    throw new Error(`mobile drawer geometry is unstable: left=${rect.left.toFixed(1)} width=${rect.width.toFixed(1)} minimum=${minimumWidth.toFixed(1)}`);
  }
  if (rect.scrollWidth > rect.clientWidth + 1) throw new Error(`mobile drawer has horizontal overflow: scroll=${rect.scrollWidth} client=${rect.clientWidth}`);
}

async function clickUnifiedNav(page, label, mobile) {
  await openUnifiedDrawerIfNeeded(page, mobile);
  const sidebar = page.locator('[data-testid="unified-sidebar"]');
  await clickScopedButton(sidebar, label, { exact: true });
  if (mobile && await sidebar.evaluate((node) => node.classList.contains('drawer-open'))) {
    throw new Error(`mobile drawer stayed open after selecting ${label}`);
  }
  if (mobile) await page.waitForTimeout(240);
}

async function smokeUnifiedShell(page, mobile) {
  const sidebar = page.locator('[data-testid="unified-sidebar"]');
  await sidebar.waitFor({ state: 'attached', timeout: 5000 });
  await openUnifiedDrawerIfNeeded(page, mobile);
  await assertCount(sidebar.locator('.primary-nav button:not(.new-task-action)'), 6, 'unified primary navigation items');
  for (const label of ['工作台', '任务', '项目管理', '交付记录', '自动化', '资料与知识']) {
    await firstVisible(sidebar.getByRole('button', { name: label, exact: true }), `unified nav ${label}`);
  }
  await firstVisible(sidebar.getByRole('tab', { name: 'Work 工作台', exact: true }), 'Work mode switch');
  await firstVisible(sidebar.getByRole('tab', { name: 'Code 工作台', exact: true }), 'Code mode switch');
  await assertCount(sidebar.locator('[data-testid="workspace-selector"]'), 0, 'removed Workspace selector');
  await assertText(page, '项目与任务', 'Project Task hierarchy');
  await assertText(page, '收件箱项目', 'explicit inbox project');
  await firstVisible(sidebar.getByRole('button', { name: /创建第一个任务/ }), 'empty inbox task CTA');

  await (await firstVisible(sidebar.getByRole('tab', { name: 'Code 工作台', exact: true }), 'Code mode switch')).click();
  await assertText(page, '当前任务的工程检查器', 'Code workbench after mode switch');
  await openUnifiedDrawerIfNeeded(page, mobile);
  for (const label of ['代码对话', '工程总览', 'Workspace', 'Context', 'Diff', 'Checkpoints']) {
    await firstVisible(sidebar.getByRole('button', { name: label, exact: true }), `Code nav ${label}`);
  }
  await (await firstVisible(sidebar.getByRole('tab', { name: 'Work 工作台', exact: true }), 'Work mode switch')).click();
  await assertText(page, '从一项真实任务开始', 'Work workbench restored');
}

async function smokeCodeInspectorNavigation(page, mobile) {
  await openUnifiedDrawerIfNeeded(page, mobile);
  const sidebar = page.locator('[data-testid="unified-sidebar"]');
  await (await firstVisible(sidebar.getByRole('tab', { name: 'Code 工作台', exact: true }), 'Code mode switch')).click();

  const routes = [
    ['工程总览', 'overview', '任务'],
    ['Workspace', 'workspace', 'Workspace'],
    ['Context', 'context', 'Context'],
    ['Diff', 'changes', 'Diff'],
    ['Checkpoints', 'checkpoints', 'Checkpoints'],
  ];
  const assertInspectorState = async (panel, inspector, label) => {
    const workbench = page.locator('.workbench');
    if ((await workbench.getAttribute('data-current-code-panel')) !== panel) {
      throw new Error(`${label} opened the wrong Code panel`);
    }
    const context = page.locator('[data-testid="task-context-bar"]');
    const selectedInspector = context.locator('[role="tab"][aria-selected="true"]');
    await assertCount(selectedInspector, 1, `${label} selected Task inspector`);
    if ((await selectedInspector.innerText()).trim() !== inspector) {
      throw new Error(`${label} left the Task inspector on ${(await selectedInspector.innerText()).trim()}`);
    }
  };
  for (const [nav, panel, inspector] of routes) {
    await clickUnifiedNav(page, nav, mobile);
    const activeNav = await firstVisible(sidebar.getByRole('button', { name: nav, exact: true }), `active Code nav ${nav}`);
    if (!(await activeNav.evaluate((node) => node.classList.contains('active')))) {
      throw new Error(`${nav} Code navigation is not visibly active`);
    }
    await assertInspectorState(panel, inspector, nav);
  }

  await clickUnifiedNav(page, '工程总览', mobile);
  await clickButton(page, '模型渠道', { exact: true });
  await assertInspectorState('overview', '任务', 'model settings shortcut');
  await firstVisible(page.locator('.user-panel-modal'), 'model settings dialog');
  await closeOverlays(page);

  const codeStatus = page.locator('.code-workbench-status-grid');
  await codeStatus.locator('button').nth(1).click();
  await assertInspectorState('overview', '任务', 'runtime settings shortcut');
  await firstVisible(page.locator('.user-panel-modal'), 'runtime settings dialog');
  await closeOverlays(page);

  await openUnifiedDrawerIfNeeded(page, mobile);
  await (await firstVisible(sidebar.getByRole('tab', { name: 'Work 工作台', exact: true }), 'Work mode switch')).click();
}

async function smokeBeginnerTaskLoop(page, mobile) {
  await openUnifiedDrawerIfNeeded(page, mobile);
  const sidebar = page.locator('[data-testid="unified-sidebar"]');
  const newTaskAction = await firstVisible(sidebar.getByRole('button', { name: '新建任务', exact: true }), 'compact new task action');
  const newTaskStyle = await newTaskAction.evaluate((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return { backgroundColor: style.backgroundColor, height: rect.height, width: rect.width, title: node.getAttribute('title') || '' };
  });
  if (newTaskStyle.backgroundColor !== 'rgba(0, 0, 0, 0)') throw new Error(`new task action is still visually filled: ${newTaskStyle.backgroundColor}`);
  if ((!mobile && (newTaskStyle.height > 30 || newTaskStyle.width > 30)) || (mobile && (newTaskStyle.height > 42 || newTaskStyle.width > 42))) throw new Error(`new task action is larger than its Codex-style title action rhythm: ${newTaskStyle.width}x${newTaskStyle.height}`);
  if (!newTaskStyle.title.includes('新建任务') || !newTaskStyle.title.match(/⌘N|Ctrl N/)) throw new Error(`new task action tooltip lost its label or shortcut: ${newTaskStyle.title}`);
  const sortButton = await firstVisible(sidebar.getByRole('button', { name: /项目排序：最近更新/ }), 'project sort action');
  await sortButton.click();
  await firstVisible(sidebar.getByRole('button', { name: /项目排序：名称/ }), 'cycled project sort state');
  await clickScopedButton(sidebar, '新建项目', { exact: true });
  if (mobile && await sidebar.evaluate((node) => node.classList.contains('drawer-open'))) throw new Error('mobile drawer stayed open after starting project creation');
  await assertText(page, '新建项目', 'real project creation dialog');
  await closeOverlays(page);

  await clickUnifiedNav(page, '任务', mobile);
  const taskCenter = page.locator('[data-testid="task-center"]');
  await taskCenter.waitFor({ state: 'visible', timeout: 5000 });
  for (const label of ['进行中', '待办', '已归档']) await firstVisible(taskCenter.getByRole('tab', { name: new RegExp(label) }), `task center tab ${label}`);
  await assertCount(page.locator('[data-testid="task-context-bar"]'), 0, 'task center technical context bar');
  const taskCenterBody = await taskCenter.innerText();
  for (const label of ['Workspace', 'Model', 'Permission', '工程检查']) {
    if (taskCenterBody.includes(label)) throw new Error(`task center exposes advanced context: ${label}`);
  }
}

async function smokeUnifiedRoutes(page, mobile) {
  const routes = [
    ['工作台', '从一项真实任务开始'],
    ['任务', '还没有进行中的任务'],
    ['项目管理', '项目管理'],
    ['交付记录', '报告设计'],
    ['自动化', '自动化任务'],
    ['资料与知识', '资料中心'],
  ];
  for (const [nav, expected] of routes) {
    await clickUnifiedNav(page, nav, mobile);
    await assertText(page, expected, `${nav} route`);
    if (nav === '自动化') {
      const empty = page.locator('.automation-task-empty');
      await empty.waitFor({ state: 'visible', timeout: 5000 });
      await assertText(page, '暂无自动化任务', 'automation definition empty state');
      await firstVisible(empty.getByRole('button', { name: '新建自动化任务', exact: true }), 'automation empty-state CTA');
    }
  }
}

async function smokeCurrentDialogs(page, mobile) {
  const dialogFlows = [
    ['自动化', '新建自动化任务', '新建自动化任务'],
    ['交付记录', '新建报告', '新建分析报告'],
    ['资料与知识', '上传资料', '上传资料'],
    ['资料与知识', '批量导入', '批量导入'],
  ];
  for (const [nav, opener, title] of dialogFlows) {
    await closeOverlays(page);
    await clickUnifiedNav(page, nav, mobile);
    await clickButton(page, opener, { exact: true });
    const modal = page.locator('.config-modal').last();
    await modal.waitFor({ state: 'visible', timeout: 5000 });
    await firstVisible(modal.getByText(title, { exact: true }), `${nav} dialog title ${title}`);
    await closeOverlays(page);
  }
  await clickUnifiedNav(page, '工作台', mobile);
}

async function smokeBackendHonesty(page, mobile) {
  const hasBindings = await page.evaluate(() => Boolean(window.go?.main?.App));
  if (hasBindings) throw new Error('browser-preview smoke unexpectedly has Wails bindings');

  await clickUnifiedNav(page, '项目管理', mobile);
  const projectRows = page.locator('.project-matter-card');
  const beforeProjects = await projectRows.count();
  const projectPage = page.locator('.project-management-page');
  await clickScopedButton(projectPage, '新建项目', { exact: true });
  const projectModal = page.locator('.config-modal').last();
  await projectModal.locator('input[placeholder*="客户门户上线"]').fill('浏览器预览不可落库项目');
  await clickScopedButton(projectModal, '确认', { exact: true });
  await assertBackendUnavailableNotice(page, 'save project');
  await closeOverlays(page);
  await clickUnifiedNav(page, '项目管理', mobile);
  await assertCount(projectRows, beforeProjects, 'unbound project save must not mutate records');
  await assertCount(page.getByText('浏览器预览不可落库项目', { exact: true }), 0, 'unbound project must not appear in sidebar or project list');

  await openUnifiedDrawerIfNeeded(page, mobile);
  const sidebar = page.locator('[data-testid="unified-sidebar"]');
  await clickScopedButton(sidebar, '新建任务', { exact: true });
  const body = await page.locator('body').innerText();
  if (!/未连接桌面后端|Wails 桌面运行环境|先完成运行配置/.test(body)) {
    throw new Error('new task preview does not explain the unavailable desktop backend');
  }
  const composer = page.getByTestId('composer-input');
  if (await composer.isVisible().catch(() => false)) throw new Error('browser preview exposed a composer without a desktop backend');
  if (await page.locator('.transcript .message--assistant').count() !== 0) throw new Error('browser preview fabricated an assistant message');
  await clickUnifiedNav(page, '工作台', mobile);
}

async function smokeResultDrivenToday(page, mobile) {
  await clickUnifiedNav(page, '工作台', mobile);
  await assertText(page, '从一项真实任务开始');
  const launchPanel = page.locator('[data-testid="work-launch-panel"]');
  await launchPanel.waitFor({ state: 'visible', timeout: 5000 });
  const launchStyle = await launchPanel.evaluate((node) => {
    const style = getComputedStyle(node);
    return { backgroundColor: style.backgroundColor, borderRadius: style.borderRadius };
  });
  if (launchStyle.backgroundColor !== 'rgb(255, 255, 255)') throw new Error(`work launch panel did not use the neutral content surface: ${launchStyle.backgroundColor}`);
  if (launchStyle.borderRadius !== '12px') throw new Error(`work launch panel radius drifted: ${launchStyle.borderRadius}`);
  const primaryActionColor = await launchPanel.locator('.home-primary-flow__copy button').first().evaluate((node) => getComputedStyle(node).backgroundColor);
  const primaryActionChannels = primaryActionColor.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
  if (primaryActionChannels.length !== 3 || Math.max(...primaryActionChannels) > 45 || Math.max(...primaryActionChannels) - Math.min(...primaryActionChannels) > 3) {
    throw new Error(`work primary action did not use a neutral graphite color: ${primaryActionColor}`);
  }
  const activeNavigationColor = await page.locator('[data-testid="unified-sidebar"] .primary-nav button.active').evaluate((node) => getComputedStyle(node).color);
  if (activeNavigationColor === 'rgb(15, 123, 85)') throw new Error('active navigation still uses the success-green selection color');
  await firstVisible(page.getByRole('button', { name: '新建任务', exact: true }), 'new task CTA');
  await firstVisible(page.getByRole('button', { name: '先选择项目', exact: true }), 'choose project CTA');
  await assertCount(page.locator('.result-scenarios button'), 5, 'strong outcome scenarios');
  for (const label of ['当前任务', '待处理', '最近任务', '从结果模板开始']) await assertText(page, label, `core work home ${label}`);
  for (const label of ['还没有正在推进的任务', '目前没有待处理事项', '还没有最近任务']) await assertText(page, label, `truthful empty state ${label}`);
  const body = await page.locator('.result-home-page').innerText();
  for (const secondary of ['工程检查', '连接模型', 'Workspace', 'Context', 'Diff', 'Checkpoints']) {
    if (body.includes(secondary)) throw new Error(`work home still foregrounds a secondary flow: ${secondary}`);
  }
}

async function smokeOutcomeTemplates(page, mobile) {
  await openUnifiedDrawerIfNeeded(page, mobile);
  const sidebar = page.locator('[data-testid="unified-sidebar"]');
  await clickScopedButton(sidebar, '新建任务', { exact: true });
  if (mobile && await sidebar.evaluate((node) => node.classList.contains('drawer-open'))) {
    throw new Error('mobile drawer stayed open after starting a new Task');
  }
  const launcher = page.locator('[data-testid="outcome-template-launcher"]');
  await launcher.waitFor({ state: 'visible', timeout: 5000 });
  await assertCount(launcher.locator('[data-outcome-template]'), 5, 'outcome templates');
  for (const label of ['审查并修复', '构建失败诊断', '内部资料驱动变更', 'Issue 到可验证交付', '发布验收']) {
    await firstVisible(launcher.getByRole('button', { name: new RegExp(label) }), `outcome template ${label}`);
  }
  await clickScopedButton(launcher, /发布验收/);
  const selected = launcher.locator('[data-outcome-template="release-acceptance"]');
  if (!(await selected.evaluate((node) => node.classList.contains('active')))) throw new Error('selected outcome template is not visibly active');
  await assertText(page, '先完成运行配置', 'honest runtime requirement');
}

async function smokeTaskReceipt(page, mobile) {
  await openUnifiedDrawerIfNeeded(page, mobile);
  const sidebar = page.locator('[data-testid="unified-sidebar"]');
  await clickScopedButton(sidebar, 'E2E 发布验收任务', { exact: false });
  if (mobile && await sidebar.evaluate((node) => node.classList.contains('drawer-open'))) throw new Error('mobile drawer stayed open after opening a Task');
  const receipt = page.locator('[data-testid="task-result-receipt"]');
  await receipt.waitFor({ state: 'visible', timeout: 5000 });
  if ((await receipt.getAttribute('data-receipt-state')) !== 'pending-review') throw new Error('receipt state was not restored truthfully');
  await assertText(page, '可验证交付收据');
  await assertText(page, '待证据复核');
  for (const label of ['目标', '执行配置', '改动', '验证', '产物', '数据去向', '回滚']) await assertText(page, label, `receipt section ${label}`);
  const context = page.locator('[data-testid="task-context-bar"]');
  await context.waitFor({ state: 'visible', timeout: 5000 });
  for (const label of ['Workspace', 'Project', 'Agent Profile', 'Model', 'Permission', 'Memory']) await assertText(page, label, `task context ${label}`);
  const visibleContextItems = await context.locator('.context-values > span').evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).display !== 'none').length);
  if (visibleContextItems !== 6) throw new Error(`task context exposes ${visibleContextItems}/6 runtime axes`);
  await context.getByRole('button', { name: '进入 Code 工程检查', exact: true }).click();
  await assertText(page, '任务检查器', 'Task inspector title');
  await openUnifiedDrawerIfNeeded(page, mobile);
  const modeSidebar = page.locator('[data-testid="unified-sidebar"]');
  await (await firstVisible(modeSidebar.getByRole('tab', { name: 'Work 工作台', exact: true }), 'Work mode switch')).click();
  await assertText(page, '希望得到什么结果？', 'return to Task result launcher');
  await openUnifiedDrawerIfNeeded(page, mobile);
  const restoredSidebar = page.locator('[data-testid="unified-sidebar"]');
  await clickScopedButton(restoredSidebar, 'E2E 发布验收任务', { exact: false });
  await receipt.waitFor({ state: 'visible', timeout: 5000 });
  const activity = page.locator('[data-testid="task-activity-center"]');
  await activity.waitFor({ state: 'visible', timeout: 5000 });
  const expandActivity = activity.getByRole('button', { name: '展开任务活动', exact: true });
  await expandActivity.click();
  await assertText(page, '本轮已结束，等待验证证据与人工复核。', 'expanded task activity receipt state');
}

async function smokeArchivedTaskRecovery(page, mobile) {
  await clickUnifiedNav(page, '任务', mobile);
  const taskCenter = page.locator('[data-testid="task-center"]');
  await taskCenter.waitFor({ state: 'visible', timeout: 5000 });
  await (await firstVisible(taskCenter.getByRole('tab', { name: /已归档/ }), 'archived task tab')).click();
  await assertText(page, 'E2E 已归档任务', 'archived task row');
  await clickScopedButton(taskCenter, '恢复 E2E 已归档任务', { exact: true });
  await assertText(page, '任务已恢复', 'archive recovery notice');
  await assertText(page, 'E2E 已归档任务', 'restored active task');
}

async function smokeGovernanceCenter(page, mobile) {
  await openUnifiedDrawerIfNeeded(page, mobile);
  const sidebar = page.locator('[data-testid="unified-sidebar"]');
  await clickScopedButton(sidebar, /配置与治理/);
  if (mobile && await sidebar.evaluate((node) => node.classList.contains('drawer-open'))) {
    throw new Error('mobile drawer stayed open after selecting governance');
  }

  const governance = page.locator('[data-testid="governance-center"]');
  await governance.waitFor({ state: 'visible', timeout: 5000 });
  await assertCount(governance.locator('button'), 8, 'governance categories');
  for (const label of ['Agent 配置', '能力扩展', '模型渠道', '数据与信任', '分层记忆', '运行与权限', '同步与备份', '操作记录']) {
    const buttonCount = await visibleCount(governance.getByRole('button', { name: new RegExp(label) }));
    const optionCount = await governance.locator('option').filter({ hasText: label }).count();
    if (buttonCount < 1 && optionCount < 1) throw new Error(`missing governance ${label}`);
  }

  const trust = page.locator('[data-testid="trust-center"]');
  await trust.waitFor({ state: 'visible', timeout: 5000 });
  await assertText(page, '未连接桌面后端', 'honest trust center empty state');
  await assertCount(trust.locator('[data-testid="trust-flow-row"]'), 0, 'unbound trust flows');
  await assertCount(trust.locator('details[open]'), 0, 'trust paths default collapsed');

  if (mobile) await governance.getByTestId('governance-mobile-select').selectOption('scopedMemory');
  else await clickScopedButton(governance, /分层记忆/);
  const memory = page.locator('[data-testid="scoped-memory-manager"]');
  await memory.waitFor({ state: 'visible', timeout: 5000 });
  await assertText(page, '分层记忆不会使用浏览器预览数据', 'honest scoped memory empty state');
  await assertCount(memory.locator('[data-testid="scoped-memory-entry"]'), 0, 'unbound scoped memory entries');

  if (mobile) await governance.getByTestId('governance-mobile-select').selectOption('trust');
  else await clickScopedButton(governance, /数据与信任/);
  await trust.waitFor({ state: 'visible', timeout: 5000 });
}

async function smokeResponsiveGeometry(page) {
  const geometry = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  if (Math.max(geometry.scroll, geometry.body) > geometry.viewport + 1) {
    throw new Error(`horizontal overflow: viewport=${geometry.viewport}, document=${geometry.scroll}, body=${geometry.body}`);
  }
}

async function smokeViewport(label, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  const mobile = viewport.width <= 720;
  await page.addInitScript(() => {
    window.localStorage.removeItem('voltui.workbench.ia.v2');
    window.localStorage.removeItem('volt-gui.sidebar-state.v1');
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  await runStep(page, errors, `${label} unified workbench load`, async () => {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.locator('.shell').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-testid="work-launch-panel"]').waitFor({ state: 'visible', timeout: 15000 });
  });
  await runStep(page, errors, `${label} unified IA shell`, () => smokeUnifiedShell(page, mobile));
  await runStep(page, errors, `${label} Code inspector navigation`, () => smokeCodeInspectorNavigation(page, mobile));
  await runStep(page, errors, `${label} beginner task loop`, () => smokeBeginnerTaskLoop(page, mobile));
  await runStep(page, errors, `${label} result-driven today`, () => smokeResultDrivenToday(page, mobile));
  await runStep(page, errors, `${label} six unified routes`, () => smokeUnifiedRoutes(page, mobile));
  await runStep(page, errors, `${label} current workflow dialogs`, () => smokeCurrentDialogs(page, mobile));
  await runStep(page, errors, `${label} backend honesty`, () => smokeBackendHonesty(page, mobile));
  await runStep(page, errors, `${label} five result templates`, () => smokeOutcomeTemplates(page, mobile));
  await runStep(page, errors, `${label} governance trust and memory`, () => smokeGovernanceCenter(page, mobile));
  await runStep(page, errors, `${label} no seeded fingerprints`, () => smokeNoSeedContent(page, mobile));
  await runStep(page, errors, `${label} responsive geometry`, () => smokeResponsiveGeometry(page));
  await page.close();

  const receiptPage = await browser.newPage({ viewport });
  await receiptPage.addInitScript((fixture) => {
    window.localStorage.setItem('voltui.workbench.ia.v2', JSON.stringify(fixture));
    window.localStorage.removeItem('volt-gui.sidebar-state.v1');
  }, receiptTestFixture());
  receiptPage.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`${msg.type()}: ${msg.text()}`);
  });
  receiptPage.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await runStep(receiptPage, errors, `${label} isolated receipt fixture`, async () => {
    await receiptPage.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await receiptPage.locator('.shell').waitFor({ state: 'visible', timeout: 15000 });
    await smokeTaskReceipt(receiptPage, mobile);
  });
  await runStep(receiptPage, errors, `${label} archived task recovery`, () => smokeArchivedTaskRecovery(receiptPage, mobile));
  await receiptPage.close();
}

async function smokeLifecycleComponentStates(label, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  await page.addInitScript(() => {
    window.localStorage.removeItem('voltui.workbench.ia.v2');
    window.localStorage.removeItem('volt-gui.sidebar-state.v1');
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  await runStep(page, errors, `${label} lifecycle component states`, async () => {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate(async () => {
      const { mount } = await import('/@id/svelte');
      const [
        { default: TaskActivityCenter },
        { default: ThreadQueue },
        { default: DiffCommentPanel },
        { default: ManagedWorktreePanel },
        { diffRevision },
      ] = await Promise.all([
        import('/src/components/TaskActivityCenter.svelte'),
        import('/src/components/ThreadQueue.svelte'),
        import('/src/components/DiffCommentPanel.svelte'),
        import('/src/components/ManagedWorktreePanel.svelte'),
        import('/src/lib/diff-review.ts'),
      ]);

      document.body.innerHTML = '<main id="lifecycle-fixture"><section id="activity-fixture"></section><section id="queue-fixture"></section><section id="diff-fixture"></section><section id="worktree-fixture"></section></main>';
      document.body.style.margin = '0';
      document.body.style.background = '#f3f5f2';
      const root = document.getElementById('lifecycle-fixture');
      Object.assign(root.style, {
        display: 'grid',
        gap: '16px',
        maxWidth: '1120px',
        margin: '0 auto',
        padding: '20px',
      });

      const events = [];
      window.__voltLifecycleSmokeEvents = events;
      mount(TaskActivityCenter, {
        target: document.getElementById('activity-fixture'),
        props: {
          tabs: [
            { id: 'tab-main', label: '修复登录回归', running: true, pendingPrompt: true, backgroundJobs: 2 },
            { id: 'tab-bg', label: '后台执行验证', running: true, pendingPrompt: false, backgroundJobs: 1 },
          ],
          currentTabId: 'tab-main',
          queuedMessages: [{ id: 'q1', tabId: 'tab-main', display: '补充回归测试', status: 'queued' }],
          receipt: { state: 'failed' },
          changesCount: 3,
          checkpointCount: 2,
          lastError: '验证命令失败，请选择恢复动作。',
          canRestoreDraft: true,
          onRecover: (action) => events.push(`recover:${action}`),
          onSwitchTab: (id) => events.push(`switch:${id}`),
          onCancelTab: (id) => events.push(`cancel:${id}`),
        },
      });

      mount(ThreadQueue, {
        target: document.getElementById('queue-fixture'),
        props: {
          messages: [
            { id: 'q1', tabId: 'tab-main', display: '先补充回归测试，再检查失败路径。', status: 'queued' },
            { id: 'q2', tabId: 'tab-main', display: '验证完成后整理交付收据。', status: 'failed', error: '上一轮未送达' },
          ],
          onEdit: (id, value) => events.push(`edit:${id}:${value}`),
          onDelete: (id) => events.push(`delete:${id}`),
          onMove: (id, offset) => events.push(`move:${id}:${offset}`),
          onSteer: (id) => events.push(`steer:${id}`),
          onResume: (id) => events.push(`resume:${id}`),
        },
      });

      const diff = '@@ -1,3 +1,4 @@\n const ready = true;\n+const verified = false;\n export { ready };';
      mount(DiffCommentPanel, {
        target: document.getElementById('diff-fixture'),
        props: {
          path: 'src/runtime.ts',
          diff,
          comments: [{ id: 'c1', path: 'src/runtime.ts', revision: diffRevision(diff), line: 3, body: '这里需要真实验证结果。', status: 'open' }],
          onAdd: (_path, _revision, line, body) => events.push(`comment:${line}:${body}`),
          onResolve: (id, resolved) => events.push(`resolve:${id}:${resolved}`),
          onDelete: (id) => events.push(`comment-delete:${id}`),
          onRequestFix: (path) => events.push(`fix:${path}`),
        },
      });

      mount(ManagedWorktreePanel, {
        target: document.getElementById('worktree-fixture'),
        props: {
          repositoryRoot: '/workspace/volt-gui',
          worktrees: [
            { id: 'source', name: 'review-auth-flow', path: '/workspace/review-auth-flow', branch: 'review/auth-flow', head: 'abcdef123456', status: 'ready', dirty: true },
            { id: 'target', name: 'verify-auth-flow', path: '/workspace/verify-auth-flow', branch: 'verify/auth-flow', head: 'abcdef123456', status: 'ready', dirty: false },
          ],
          snapshots: [{ id: 'snapshot-001', worktreeId: 'source', baseHead: 'abcdef123456', untrackedCount: 1 }],
          onHandoff: (source, target, summary) => events.push(`handoff:${source}:${target}:${summary}`),
          onRestore: (snapshot, target) => events.push(`restore:${snapshot}:${target}`),
        },
      });
    });

    const activity = page.locator('[data-testid="task-activity-center"]');
    await activity.waitFor({ state: 'visible', timeout: 5000 });
    await assertText(page, '结构化恢复', 'failed task recovery state');
    const activityToggle = activity.getByRole('button', { name: '收起任务活动', exact: true });
    await activityToggle.click();
    if (await activity.getByText('结构化恢复', { exact: true }).isVisible().catch(() => false)) {
      throw new Error('recovery state cannot be manually collapsed');
    }
    await activity.getByRole('button', { name: '展开任务活动', exact: true }).click();
    await assertText(page, '结构化恢复', 're-expanded failed task recovery state');
    await activity.getByRole('button', { name: '重试', exact: true }).click();

    const queue = page.locator('[data-testid="thread-message-queue"]');
    await assertCount(queue.locator('article'), 2, 'queued lifecycle rows');
    const queueMenus = queue.locator('details');
    await queueMenus.first().locator('summary').click();
    for (const action of ['编辑', '上移', '下移', '删除']) {
      const button = queueMenus.first().getByRole('button', { name: action, exact: true });
      if (!await button.isVisible()) throw new Error(`first queue overflow action is clipped: ${action}`);
    }
    await queueMenus.first().locator('summary').click();
    await queueMenus.last().locator('summary').scrollIntoViewIfNeeded();
    await queueMenus.last().locator('summary').click();
    for (const action of ['编辑', '上移', '下移', '删除']) {
      const button = queueMenus.last().getByRole('button', { name: action, exact: true });
      if (!await button.isVisible()) throw new Error(`last queue overflow action is clipped: ${action}`);
    }
    await queueMenus.last().locator('summary').click();
    await queueMenus.first().locator('summary').click();
    await queue.getByRole('button', { name: '编辑', exact: true }).click();
    await queue.locator('textarea').fill('补充失败路径与回归测试。');
    await queue.getByRole('button', { name: '保存', exact: true }).click();

    const diffPanel = page.locator('[data-testid="diff-comment-panel"]');
    await diffPanel.locator('summary').click();
    await diffPanel.locator('input[type="number"]').fill('3');
    await diffPanel.locator('textarea').fill('把验证状态改为真实执行结果。');
    await diffPanel.getByRole('button', { name: '添加评论', exact: true }).click();
    await diffPanel.getByRole('button', { name: /发送 1 条评论去修复/ }).click();

    const worktree = page.locator('[data-testid="managed-worktree-panel"]');
    await worktree.getByRole('button', { name: '管理', exact: true }).click();
    await worktree.locator('select').nth(0).selectOption('source');
    await worktree.locator('select').nth(1).selectOption('target');
    await worktree.locator('textarea').fill('交给独立验证工作区复核。');
    await worktree.getByRole('button', { name: '创建快照并交接', exact: true }).click();

    const events = await page.evaluate(() => window.__voltLifecycleSmokeEvents || []);
    for (const expected of ['recover:retry', 'edit:q1:补充失败路径与回归测试。', 'comment:3:把验证状态改为真实执行结果。', 'fix:src/runtime.ts', 'handoff:source:target:交给独立验证工作区复核。']) {
      if (!events.includes(expected)) throw new Error(`lifecycle callback missing: ${expected}`);
    }
    await smokeResponsiveGeometry(page);
    await page.screenshot({ path: `${outDir}/${safeName(`${label} lifecycle component worktree state`)}.png`, fullPage: false });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
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
  await smokeLifecycleComponentStates('desktop', { width: 1440, height: 950 });
  await smokeLifecycleComponentStates('mobile', { width: 390, height: 844 });
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
  mode: 'unified-ia-result-driven-workbench',
  limitation: 'Browser preview verifies IA, persisted v2 migration shape, truthful receipt rendering and responsive navigation. Backend execution evidence still requires the Wails runtime integration gates.',
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
