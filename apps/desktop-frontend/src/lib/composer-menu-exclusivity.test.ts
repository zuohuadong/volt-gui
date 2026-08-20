import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

function functionSource(source: string, functionName: string) {
  const start = source.indexOf(`function ${functionName}`);
  const next = source.indexOf("\n  function ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

describe("composer menu exclusivity", () => {
  test("keeps runtime, attachment, project, and permission menus mutually exclusive", () => {
    const composer = readFileSync(resolve("src/components/Composer.svelte"), "utf8");

    for (const toggleName of ["togglePlusMenu", "toggleProjectMenu", "togglePermissionMenu"]) {
      expect(functionSource(composer, toggleName)).toContain("runtimeMenuOpen = false");
    }
    expect(functionSource(composer, "runtimeMenuOpenChanged")).toContain("plusMenuOpen = false");
    expect(functionSource(composer, "runtimeMenuOpenChanged")).toContain("projectMenuOpen = false");
    expect(functionSource(composer, "runtimeMenuOpenChanged")).toContain("permissionMenuOpen = false");
    expect(functionSource(composer, "hasOpenMenu")).toContain("runtimeMenuOpen");
  });

  test("closes the parent runtime disclosure when a composer menu opens", () => {
    const composerRuntimeMenu = readFileSync(resolve("src/components/ComposerRuntimeMenu.svelte"), "utf8");
    const app = readFileSync(resolve("src/App.svelte"), "utf8");

    expect(composerRuntimeMenu).toContain("onOpenChange?.(nextOpen)");
    expect(app).toContain("bind:open={agentRuntimeDisclosureOpen}");
    expect(app).toContain("if (open) agentRuntimeDisclosureOpen = false");
  });

  test("closes composer menus when an outside control is activated by pointer or keyboard", () => {
    const composer = readFileSync(resolve("src/components/Composer.svelte"), "utf8");

    expect(composer).toContain('addEventListener("pointerdown", closeMenusOnOutsideInteraction, true)');
    expect(composer).toContain('addEventListener("click", closeMenusOnOutsideInteraction, true)');
  });
});
