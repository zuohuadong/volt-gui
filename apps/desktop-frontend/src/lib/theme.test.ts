import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const css = readFileSync(new URL("../workbench-theme.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.svelte", import.meta.url), "utf8");
const selector = readFileSync(new URL("../components/ThemeSelector.svelte", import.meta.url), "utf8");

function luminance(hex: string): number {
  const channels = hex.match(/[a-f0-9]{2}/gi)!.map((value) => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

describe("workbench themes", () => {
  test("attachment menu uses matched surface and text tokens including native menu items", () => {
    expect(css).toMatch(/\.prompt-input-composer \[data-slot="prompt-input-action-menu-content"\]\s*{[^}]*background:\s*var\(--workbench-panel\)[^}]*color:\s*var\(--workbench-ink\)/s);
    expect(css).toContain('.prompt-input-composer [role="menuitem"]:focus-visible');
  });
  test("uses the existing mode watcher for persistent preferences and live system changes", () => {
    expect(app).toContain('<ModeWatcher defaultMode="light" disableHeadScriptInjection />');
    expect(app).toContain("<ThemeSelector />");
    for (const value of ["light", "dark", "system"]) {
      expect(selector).toContain(`value: "${value}"`);
    }
    expect(selector).toContain("setMode(option.value)");
    expect(selector).toContain("aria-pressed={userPrefersMode.current === option.value}");
  });

  for (const [name, pattern] of [
    ["dark", /:root, :root\.dark\s*{([^}]+)}/],
    ["light", /:root:not\(\.dark\)\s*{([^}]+)}/],
  ] as const) {
    test(`${name} normal, secondary and placeholder text meet AA on all workbench surfaces`, () => {
      const block = css.match(pattern)![1];
      const tokens = Object.fromEntries(
        [...block.matchAll(/--workbench-([\w-]+):\s*(#[a-f0-9]{6})/gi)]
          .map((match) => [match[1], match[2]]),
      );
      for (const text of ["ink", "ink-soft", "ink-muted"]) {
        for (const surface of ["background", "sidebar", "panel", "hover", "selected"]) {
          const values = [luminance(tokens[text]), luminance(tokens[surface])].sort((a, b) => b - a);
          expect((values[0] + 0.05) / (values[1] + 0.05), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
});
