import * as esbuild from "esbuild";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("Bundling the Electron main process with esbuild");

// ESM bundle 里的 CJS 依赖（如 node-fetch@2）会触发 esbuild 的
// "Dynamic require of X is not supported" 占位错误。
// 通过 createRequire 注入真正的 require，让 __require 垫片回退到 Node 原生 require。
const esmCompatBanner =
  "import { createRequire as __dshCreateRequire } from 'node:module';" +
  "const require = __dshCreateRequire(import.meta.url);";

await esbuild.build({
  entryPoints: [path.join(rootDir, "src/main.ts")],
  outfile: path.join(rootDir, "dist/main.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node26",
  external: ["electron", "@deepseek-ai/dsh"],
  sourcemap: true,
  banner: { js: esmCompatBanner },
});

await esbuild.build({
  entryPoints: [path.join(rootDir, "src/preload.ts")],
  outfile: path.join(rootDir, "dist/preload.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node26",
  external: ["electron"],
  sourcemap: true,
});

console.log("Electron main bundle completed.");
