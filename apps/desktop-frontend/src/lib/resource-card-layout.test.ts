import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const appComponent = readFileSync(resolve(testDirectory, "../App.svelte"), "utf8");

describe("resource card layout", () => {
  test("reserves two complete title lines for material cards", () => {
    expect(appComponent).toContain("grid-template-rows:auto minmax(0,3em) minmax(0,3.2em) auto");
    expect(appComponent).toContain(".resource-center .media-card strong,.resource-center .media-card p{display:-webkit-box;min-height:0;margin:0;overflow:hidden;line-height:1.5");
  });

  test("keeps knowledge status badges inside narrow cards", () => {
    expect(appComponent).toContain(".knowledge-template-card header>span{flex:0 0 auto;margin:0;white-space:nowrap}");
    expect(appComponent).toContain(".knowledge-template-card header>em{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}");
  });
});
