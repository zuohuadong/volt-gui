import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const svelteDist = path.resolve(__dirname, "../../desktop-frontend/dist");
const srcWorkbench = path.resolve(__dirname, "../src/workbench.html");
const distWorkbench = path.resolve(__dirname, "../dist/workbench.html");
const targetRendererDir = path.resolve(__dirname, "../dist/renderer");
const targetRendererHtml = path.resolve(targetRendererDir, "index.html");

console.log("⚡ Preparing Frontend Assets for Anyong DSH Desktop Workbench");

// 先清空旧的渲染层产物，避免历史 hash 文件堆积导致包体膨胀或引用错乱
fs.rmSync(targetRendererDir, { recursive: true, force: true });
fs.rmSync(distWorkbench, { force: true });

fs.mkdirSync(path.dirname(distWorkbench), { recursive: true });
fs.mkdirSync(targetRendererDir, { recursive: true });

if (fs.existsSync(svelteDist) && fs.existsSync(path.join(svelteDist, "index.html"))) {
  fs.cpSync(svelteDist, targetRendererDir, { recursive: true });
  fs.copyFileSync(path.join(svelteDist, "index.html"), distWorkbench);
  console.log(`✓ Copied compiled Volt GUI Svelte frontend from ${svelteDist} to ${targetRendererDir}`);
} else if (fs.existsSync(srcWorkbench)) {
  fs.copyFileSync(srcWorkbench, distWorkbench);
  fs.copyFileSync(srcWorkbench, targetRendererHtml);
  console.log(`✓ Fallback workbench copied to ${distWorkbench} and ${targetRendererHtml}`);
} else {
  console.error("✗ No frontend distribution or src/workbench.html found!");
}
