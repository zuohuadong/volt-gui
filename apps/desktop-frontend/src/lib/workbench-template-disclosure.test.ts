import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("workbench template disclosure", () => {
  test("uses controlled state so queued-message overlays cannot block template expansion", () => {
    const launcherSource = readFileSync(resolve("src/components/TaskOutcomeLauncher.svelte"), "utf8");

    expect(launcherSource).toContain("let moreTemplatesOpen = $state(false)");
    expect(launcherSource).toContain("aria-expanded={moreTemplatesOpen}");
    expect(launcherSource).toContain("onclick={() => (moreTemplatesOpen = !moreTemplatesOpen)}");
    expect(launcherSource).toContain("{#if moreTemplatesOpen}");
    expect(launcherSource).not.toContain('<details class="more-templates">');
  });

  test("lets the task surface grow when the additional template row is visible", () => {
    const appSource = readFileSync(resolve("src/App.svelte"), "utf8");
    const shellStyles = [...appSource.matchAll(/\.agent-assistant-shell \{([^}]*)\}/g)].map((match) => match[1]);
    const templateLayoutStyle = shellStyles.find((style) => style.includes("grid-template-rows")) ?? "";

    expect(templateLayoutStyle).toContain("grid-template-rows: minmax(min-content, 1fr) auto auto");
    expect(templateLayoutStyle).toContain("min-height: 100%");
    expect(templateLayoutStyle).not.toContain("height: 100dvh");
  });
});
