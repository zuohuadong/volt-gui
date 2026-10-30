import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const theme = readFileSync(new URL("../workbench-theme.css", import.meta.url), "utf8");

test("keeps the conversation heading in a compact single row", () => {
  expect(theme).toMatch(/\.conversation-header\s*{[^}]*min-height: 42px/);
  expect(theme).toMatch(/\.conversation-title\s*{[^}]*align-items: center/);
  expect(theme).not.toMatch(/\.conversation-title\s*{[^}]*flex-direction: column/);
  expect(theme).toMatch(/\.conversation-title h1\s*{[^}]*white-space: nowrap/);
  expect(theme).toMatch(/\.conversation-title p\s*{[^}]*white-space: nowrap/);
  expect(theme).toContain(".conversation-title p { display: none; }");
  expect(theme).toMatch(/\.conversation-header \.header-actions button\s*{[^}]*width: 30px; height: 30px/);
});
