import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const elementsRequire = createRequire(require.resolve("@svadmin/ai-elements"));

describe("security dependency compatibility", () => {
  it("renders math but never inherits trusted rendering from options prototypes", () => {
    const katex = elementsRequire("katex");
    expect(katex.version).toBe("0.18.10");
    const math = katex.renderToString("\\frac{1}{2}+x^2", { throwOnError: true });
    expect(math).toContain('class="katex"');
    expect(math).toContain("<math");
    const untrusted = katex.renderToString("\\href{javascript:0}{link}", Object.create({ trust: true }));
    expect(untrusted).not.toContain("<a ");
    expect(untrusted).not.toContain('href="javascript:');
  });

  it("processes an indexed source map with a huge offset without blocking", () => {
    const tailwindRequire = createRequire(require.resolve("@tailwindcss/vite"));
    const compilerRequire = createRequire(tailwindRequire.resolve("@tailwindcss/node"));
    const modulePath = compilerRequire.resolve("source-map-js");
    const script = `
      const assert = require("node:assert/strict");
      const {SourceMapConsumer, SourceNode} = require(${JSON.stringify(modulePath)});
      const indexed = (line) => ({version:3, sections:[{
        offset:{line,column:0},
        map:{version:3,sources:["input.js"],sourcesContent:["x"],names:[],mappings:"AAAA"}
      }]});
      assert.throws(() => new SourceMapConsumer(indexed(1e12)), /Section offset line/);
      assert.equal(SourceNode.fromStringWithSourceMap("x", new SourceMapConsumer(indexed(0))).toString(), "x");
    `;
    expect(() => execFileSync(process.execPath, ["-e", script], { timeout: 5_000, stdio: "pipe" })).not.toThrow();
  });
});
