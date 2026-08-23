import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const svelteDist = path.resolve(__dirname, "../../desktop-frontend/dist-electron");
const srcWorkbench = path.resolve(__dirname, "../src/workbench.html");
const distWorkbench = path.resolve(__dirname, "../dist/workbench.html");
const targetRendererDir = path.resolve(__dirname, "../dist/renderer");
const targetRendererHtml = path.resolve(targetRendererDir, "electron.html");

console.log("Preparing frontend assets for the VoltUI Electron workbench");

// 先清空旧的渲染层产物，避免历史 hash 文件堆积导致包体膨胀或引用错乱
fs.rmSync(targetRendererDir, { recursive: true, force: true });
fs.rmSync(distWorkbench, { force: true });

fs.mkdirSync(path.dirname(distWorkbench), { recursive: true });
fs.mkdirSync(targetRendererDir, { recursive: true });

if (fs.existsSync(svelteDist) && fs.existsSync(path.join(svelteDist, "electron.html"))) {
  fs.cpSync(svelteDist, targetRendererDir, { recursive: true });
  fs.copyFileSync(srcWorkbench, distWorkbench);
  console.log(`✓ Copied compiled Volt GUI Svelte frontend from ${svelteDist} to ${targetRendererDir}`);
} else {
  throw new Error(`Electron renderer build is missing: ${targetRendererHtml}`);
}
