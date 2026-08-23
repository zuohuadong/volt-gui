import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { scanRuntimeMocks } from './check-runtime-mocks.mjs';

async function withFixture(files, run) {
  const root = path.join(tmpdir(), `voltui-runtime-mock-gate-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    for (const [relative, content] of Object.entries(files)) {
      const file = path.join(root, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('flags seed factories and fake success in the active Electron renderer', async () => {
  await withFixture({
    'apps/desktop-frontend/src/components/ElectronWorkbench.svelte': `
      const todo = { source: "seed" };
      const defaultAgentCards = [];
      function hydrateBrowserPreview() { return "浏览器预览已收到这条消息"; }
    `,
  }, async (root) => {
    const rules = new Set((await scanRuntimeMocks({ root })).map((finding) => finding.rule));
    for (const expected of ['seed-source', 'seed-factory', 'browser-fake-success']) {
      assert.equal(rules.has(expected), true, expected);
    }
  });
});

test('flags in-memory task records and fabricated persistence in DSH runtime code', async () => {
  await withFixture({
    'packages/dsh-server/src/server.ts': `
      const taskRecords = [];
      function create(data) { return { data: { id: crypto.randomUUID(), ...data } }; }
    `,
  }, async (root) => {
    const rules = new Set((await scanRuntimeMocks({ root })).map((finding) => finding.rule));
    assert.equal(rules.has('in-memory-task-records'), true);
    assert.equal(rules.has('fabricated-record-id'), true);
  });
});

test('flags Wails access in active Electron production code', async () => {
  await withFixture({
    'apps/desktop-electron/src/main.ts': 'const legacy = window.go.main.App;',
  }, async (root) => {
    const findings = await scanRuntimeMocks({ root });
    assert.equal(findings.some((finding) => finding.rule === 'legacy-wails-runtime'), true);
  });
});

test('ignores tests, generated output and the inactive legacy App surface', async () => {
  const mock = 'const taskRecords = [{ source: "seed" }];';
  await withFixture({
    'apps/desktop-electron/src/main.test.ts': mock,
    'apps/desktop-electron/dist/main.js': mock,
    'apps/desktop-frontend/src/App.svelte': mock,
    'internal/demo/testdata/mock.go': mock,
  }, async (root) => {
    assert.deepEqual(await scanRuntimeMocks({ root }), []);
  });
});

test('allows honest Electron failure and retry states', async () => {
  await withFixture({
    'apps/desktop-frontend/src/components/ElectronWorkbench.svelte': `
      const fallbackTitle = "未命名项目";
      function retry() { return "当前环境未连接 Electron preload"; }
    `,
  }, async (root) => {
    assert.deepEqual(await scanRuntimeMocks({ root }), []);
  });
});
