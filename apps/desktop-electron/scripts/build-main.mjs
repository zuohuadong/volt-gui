import * as esbuild from "esbuild";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("⚡ Bundling Electron Main and Preload with esbuild");

await esbuild.build({
  entryPoints: [path.join(rootDir, "src/main.ts")],
  outfile: path.join(rootDir, "dist/main.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["electron"],
  sourcemap: true,
});

await esbuild.build({
  entryPoints: [path.join(rootDir, "src/preload.ts")],
  outfile: path.join(rootDir, "dist/preload.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["electron"],
  sourcemap: true,
});

console.log("✓ Electron Main & Preload bundle completed.");