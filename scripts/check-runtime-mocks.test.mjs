import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { RUNTIME_MOCK_ALLOW_MARKER, scanRuntimeMocks } from './check-runtime-mocks.mjs';

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

test('flags structured seed data, default factories, known records and fake browser success', async () => {
  await withFixture({
    'desktop/frontend/src/App.svelte': `
      const todo = { id: "todo-preview-load", source: "seed" };
      const defaultAgentCards = [];
      function hydrateBrowserPreview() { updateLastAssistant("浏览器预览已收到这条消息。"); }
    `,
    'desktop/automations_app.go': 'func defaultAutomations() []string { return []string{"preflight-validation"} }',
  }, async (root) => {
    const rules = new Set((await scanRuntimeMocks({ root })).map((finding) => finding.rule));
    for (const expected of ['seed-source', 'seed-factory', 'legacy-seed-id', 'browser-fake-success']) {
      assert.equal(rules.has(expected), true, expected);
    }
  });
});

test('flags audited agent, automation-config and model-refresh seed records without blocking unrelated internal strategies', async () => {
  await withFixture({
    'desktop/frontend/src/App.svelte': `
      const agent = { id: "code-review", name: "代码审查 Agent", runs: 128 };
      const docs = [{ id: "automation-config" }];
      const sync = [{ id: "model-refresh" }];
    `,
    'internal/memorycompiler/runtime.go': 'Strategy{ID: "code-review", Description: "real internal strategy"}',
  }, async (root) => {
    const findings = await scanRuntimeMocks({ root });
    assert.equal(findings.some((finding) => finding.rule === 'legacy-agent-seed-record'), true);
    assert.equal(findings.filter((finding) => finding.rule === 'legacy-seed-id').length, 2);
    assert.equal(findings.some((finding) => finding.file.startsWith('internal/')), false);
  });
});

test('flags in-memory resources and unbound fake-success branches', async () => {
  await withFixture({
    'desktop/frontend/src/App.svelte': `
      const persisted = typeof saveTodo === "function";
      const saved = persisted ? await saveTodo(input) : { ...input, id: Date.now() };
      if (typeof persistRoom !== "function") return room;
      if (typeof deleteReport === "function") { await deleteReport(id); }
      reports = reports.filter((item) => item.id !== id);
    `,
    'desktop/frontend/src/lib/resourceProvider.ts': `
      let taskRecords = [];
      return { data: { id: crypto.randomUUID(), ...data } };
    `,
  }, async (root) => {
    const rules = new Set((await scanRuntimeMocks({ root })).map((finding) => finding.rule));
    for (const expected of ['unbound-persisted-ternary', 'unbound-persist-echo', 'optional-delete-local-success', 'in-memory-task-records', 'resource-provider-fake-create']) {
      assert.equal(rules.has(expected), true, expected);
    }
  });
});

test('does not flag tests, generated bindings, testdata or provider presets', async () => {
  const mock = 'const defaultAgentCards = [{ id: "todo-preview-load", source: "seed" }];';
  await withFixture({
    'desktop/frontend/tests/App.test.ts': mock,
    'desktop/frontend/src/example.test.ts': mock,
    'desktop/frontend/src/wailsjs/mock.ts': mock,
    'desktop/example_test.go': mock,
    'internal/demo/testdata/mock.go': mock,
    'internal/config/provider_presets.go': mock,
  }, async (root) => {
    assert.deepEqual(await scanRuntimeMocks({ root }), []);
  });
});

test('allows known legacy IDs only in an annotated whitelisted cleanup function', async () => {
  await withFixture({
    'desktop/todos_app.go': `
      func isLegacySeedTodo(todo Todo) bool {
      // ${RUNTIME_MOCK_ALLOW_MARKER}
      expected := WorkbenchTodoView{ID: "todo-preview-load", Source: "seed"}
      return reflect.DeepEqual(todo, expected)
      }
    `,
  }, async (root) => {
    assert.deepEqual(await scanRuntimeMocks({ root }), []);
  });
});

test('a cleanup marker cannot suppress a seed outside the whitelisted file and function', async () => {
  await withFixture({
    'desktop/legacy_cleanup.go': `
      func seedRuntimeData() Todo {
      // ${RUNTIME_MOCK_ALLOW_MARKER}
      return Todo{ID: "todo-preview-load"}
      }
    `,
    'desktop/todos_app.go': `
      func seedRuntimeData() Todo {
      // ${RUNTIME_MOCK_ALLOW_MARKER}
      return Todo{ID: "todo-agent-template"}
      }
    `,
  }, async (root) => {
    const findings = await scanRuntimeMocks({ root });
    assert.equal(findings.filter((finding) => finding.rule === 'legacy-seed-id').length, 2);
  });
});

test('a cleanup marker cannot suppress a seed-shaped return inside an allowed cleanup function', async () => {
  await withFixture({
    'desktop/todos_app.go': `
      func isLegacySeedTodo(todo Todo) bool {
      // ${RUNTIME_MOCK_ALLOW_MARKER}
      return Todo{ID: "todo-preview-load"}
      }
    `,
  }, async (root) => {
    const findings = await scanRuntimeMocks({ root });
    assert.equal(findings.some((finding) => finding.rule === 'legacy-seed-id'), true);
  });
});

test('a cleanup marker cannot suppress side-effect seed injection inside an allowed cleanup function', async () => {
  await withFixture({
    'desktop/todos_app.go': `
      func isLegacySeedTodo(todo Todo) bool {
      // ${RUNTIME_MOCK_ALLOW_MARKER}
      if todo.ID == "" { runtimeTodos = append(runtimeTodos, Todo{ID: "todo-preview-load", Source: "seed"}) }
      return false
      }
    `,
  }, async (root) => {
    const findings = await scanRuntimeMocks({ root });
    assert.equal(findings.some((finding) => finding.rule === 'legacy-seed-id'), true);
    assert.equal(findings.some((finding) => finding.rule === 'seed-source'), true);
  });
});

test('a cleanup marker cannot suppress side effects hidden in an expected fingerprint assignment', async () => {
  await withFixture({
    'desktop/todos_app.go': `
      func isLegacySeedTodo(todo Todo) bool {
      // ${RUNTIME_MOCK_ALLOW_MARKER}
      expected := append(runtimeTodos, Todo{ID: "todo-preview-load", Source: "seed"})
      return len(expected) == 0
      }
    `,
  }, async (root) => {
    const findings = await scanRuntimeMocks({ root });
    assert.equal(findings.some((finding) => finding.rule === 'legacy-seed-id'), true);
    assert.equal(findings.some((finding) => finding.rule === 'seed-source'), true);
  });
});

test('a pure fingerprint cannot be reused by a side-effecting consumer', async () => {
  await withFixture({
    'desktop/todos_app.go': `
      func isLegacySeedTodo(todo Todo) bool {
      // ${RUNTIME_MOCK_ALLOW_MARKER}
      expected := WorkbenchTodoView{ID: "todo-preview-load", Source: "seed"}
      return reflect.DeepEqual(todo, expected) || persistRuntimeTodo(expected)
      }
    `,
  }, async (root) => {
    const findings = await scanRuntimeMocks({ root });
    assert.equal(findings.some((finding) => finding.rule === 'legacy-seed-id'), true);
    assert.equal(findings.some((finding) => finding.rule === 'seed-source'), true);
  });
});

test('does not broadly ban preview, fallback, Date.now or honest unavailable states', async () => {
  await withFixture({
    'desktop/frontend/src/App.svelte': `
      const openedAt = Date.now();
      const fallbackTitle = "未命名项目";
      function previewImage() { return "当前环境未连接桌面后端"; }
    `,
  }, async (root) => {
    assert.deepEqual(await scanRuntimeMocks({ root }), []);
  });
});
