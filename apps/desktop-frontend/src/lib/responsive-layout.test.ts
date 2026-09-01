import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const css = readFileSync(new URL("../app.css", import.meta.url), "utf8");

describe("responsive desktop renderer layout", () => {
  test("keeps the mobile conversation viewport wider than the navigation rail", () => {
    const mobileStart = css.lastIndexOf("@media (max-width: 760px)");
    expect(mobileStart).toBeGreaterThan(css.lastIndexOf(".sidebar {\n  width: 256px;"));

    const mobileRules = css.slice(mobileStart);
    expect(mobileRules).toMatch(/\.workspace-layout\s*{\s*grid-template-columns:\s*48px minmax\(0, 1fr\)/);
    expect(mobileRules).toMatch(/\.main-grid\s*{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(mobileRules).toMatch(/\.sidebar\s*{\s*width:\s*48px/);
    expect(mobileRules).toMatch(/\.quick-actions\s*{[^}]*flex-wrap:\s*wrap !important/s);
  });

  test("keeps narrow management tabs content-sized inside a scrollable row", () => {
    const narrowStart = css.lastIndexOf("@media (max-width: 960px)");
    const narrowRules = css.slice(narrowStart);

    expect(narrowRules).toMatch(/\.management-nav,\s*\.management-content\s*{[^}]*min-width:\s*0/s);
    expect(narrowRules).toMatch(/\.management-nav button\s*{[^}]*width:\s*auto/s);
    expect(narrowRules).toMatch(/\.management-nav button\s*{[^}]*flex:\s*0 0 auto/s);
  });
});
