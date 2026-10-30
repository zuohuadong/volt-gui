import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const packageDir = path.resolve(import.meta.dirname, "..");

test("native UI bundle declares the official DSH client UI surfaces", async () => {
  const manifest = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
  assert.equal(manifest.name, "@voltui/dsh-native-ui");
  assert.equal(manifest.dsh.bundle.patch, "./cordis.patch.yml");
  assert.equal(manifest.dsh.client.platform, "web");
  assert.deepEqual(manifest.dsh.client.inject, [
    "@deepseek-ai/dsh-client-ui-slots",
    "@deepseek-ai/dsh-client-ui-renderer",
    "@deepseek-ai/dsh-client-ui-sidebar",
    "@deepseek-ai/dsh-client-ui-settings",
    "@deepseek-ai/dsh-client-ui-settings-plugins",
  ]);
});

test("client half registers and disposes all native UI contributions", async () => {
  const source = await readFile(path.join(packageDir, "lib/client.js"), "utf8");
  const loaded = [];
  const window = {
    __ModuleLoader__: {
      load(module) {
        loaded.push(module);
      },
    },
  };
  const previousWindow = globalThis.window;
  globalThis.window = window;
  try {
    await import(`${pathToFileUrl(path.join(packageDir, "lib/client.js"))}?test=${Date.now()}`);
  } finally {
    globalThis.window = previousWindow;
  }
  assert.match(source, /@deepseek-ai\/dsh-client-ui-slots/u);
  assert.equal(loaded.length, 1);
  const registrations = [];
  const active = new Set();
  const navigationCalls = [];
  const layout = { selectPanel: (panelId) => navigationCalls.push(["selectPanel", panelId]) };
  const pluginNavigation = { openBundle: (packageName) => navigationCalls.push(["openBundle", packageName]) };
  const module = loaded[0].factory((name) => {
    assert.ok(["react", "@deepseek-ai/dsh-client-ui-slots", "@deepseek-ai/dsh-client-ui-renderer"].includes(name));
    return name === "react" ? { createElement: (...args) => args } : {};
  });
  module.apply({
    get(name) {
      return name === "layout" ? layout : name === "pluginNavigation" ? pluginNavigation : undefined;
    },
    slots: {
      inject(slotName, callback) {
        const dispose = callback();
        registrations.push({ slotName, dispose });
      },
      register(options, component) {
        active.add(options.name);
        const props = options.inject?.() ?? {};
        if (options.name === "sidebar.footer.action") component(props)[1].onClick();
        if (options.name === "sidebar.workspaces.session.menu.item") {
          let menuOpen = true;
          component({
            ...props,
            useMenuOpenState: () => [menuOpen, (value) => { menuOpen = value; }],
          })[1].onClick();
          assert.equal(menuOpen, false);
        }
        return () => active.delete(options.name);
      },
    },
  });
  assert.deepEqual(registrations.map(({ slotName }) => slotName), [
    "sidebar.footer.action",
    "settings.plugins.tab",
    "sidebar.workspaces.session.menu.item",
  ]);
  assert.ok(registrations.every(({ dispose }) => typeof dispose === "function"));
  assert.deepEqual([...active], [
    "sidebar.footer.action",
    "settings.plugins.tab",
    "sidebar.workspaces.session.menu.item",
  ]);
  for (const { dispose } of registrations) dispose();
  assert.equal(active.size, 0);
  assert.deepEqual(navigationCalls, [
    ["selectPanel", "plugins"],
    ["openBundle", "@voltui/dsh-native-ui"],
    ["selectPanel", "plugins"],
    ["openBundle", "@voltui/dsh-native-ui"],
  ]);
});

function pathToFileUrl(filePath) {
  return new URL(`file:///${filePath.replaceAll("\\", "/")}`).href;
}
