import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const appCss = readFileSync(new URL("../app.css", import.meta.url), "utf8");
const workbenchCss = readFileSync(new URL("../workbench-theme.css", import.meta.url), "utf8");

function countOccurrences(source: string, fragment: string): number {
  return source.split(fragment).length - 1;
}

describe("CSS cleanup guardrails", () => {
  test("keeps the cleaned knowledge base rules single-sourced", () => {
    for (const rule of [
      ".knowledge-hero-copy { min-width: 0; }",
      ".knowledge-search-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }",
      ".knowledge-search-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }",
      ".knowledge-shortcuts strong { font-size: 11px; }",
    ]) {
      expect(countOccurrences(appCss, rule), rule).toBe(1);
    }
  });

  test("retains responsive layout rules after cleanup", () => {
    expect(appCss).toMatch(/\.knowledge-search-row\s*\{\s*grid-template-columns:\s*1fr;\s*\}/);
    expect(appCss).toMatch(/\.knowledge-shortcuts\s*\{\s*grid-template-columns:\s*1fr;\s*\}/);
    expect(workbenchCss).toContain(".workspace-layout, .workspace-layout.sidebar-collapsed { grid-template-columns: minmax(0, 1fr); }");
    expect(workbenchCss).toContain(".settings-management .provider-workbench,");
  });

  test("keeps only the important workbench overrides for shared controls", () => {
    expect(workbenchCss.match(/\.management-content input,\s*\.management-content select,\s*\.management-content textarea\s*\{/g)).toHaveLength(1);
    expect(workbenchCss).toContain("background: var(--workbench-panel) !important;");
    expect(workbenchCss).toContain("color: var(--workbench-ink) !important;");
    expect(workbenchCss).not.toContain("background: var(--workbench-panel);\n  color: var(--workbench-ink);\n}");
  });

  test("does not add an unverified broad Tailwind source override", () => {
    expect(appCss).not.toMatch(/@source\s+["']\.\.\/\.\.["']/);
  });
});
