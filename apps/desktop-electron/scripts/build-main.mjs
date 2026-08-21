import * as esbuild from "esbuild";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("⚡ Bundling Electron Main and Preload with esbuild");

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
  target: "node20",
  external: ["electron"],
  sourcemap: true,
  banner: { js: esmCompatBanner },
});

// preload 保持 CJS 并用 .cjs 后缀：包根 package.json 是 type:module，
// 若沿用 .js 会被 Electron 按 ESM 加载而失败。
await esbuild.build({
  entryPoints: [path.join(rootDir, "src/preload.ts")],
  outfile: path.join(rootDir, "dist/preload.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["electron"],
  sourcemap: true,
});

console.log("✓ Electron Main & Preload bundle completed.");
