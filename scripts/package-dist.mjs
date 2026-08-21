import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const electronDistDir = path.resolve(rootDir, "apps/desktop-electron/dist-package");
const rootDistDir = path.resolve(rootDir, "dist");

if (!fs.existsSync(rootDistDir)) {
  fs.mkdirSync(rootDistDir, { recursive: true });
}

if (fs.existsSync(electronDistDir)) {
  const files = fs.readdirSync(electronDistDir);
  for (const f of files) {
    const srcPath = path.join(electronDistDir, f);
    if (fs.statSync(srcPath).isFile()) {
      const destPath = path.join(rootDistDir, f);
      fs.copyFileSync(srcPath, destPath);
      console.log(`✓ Copied ${f} to dist/${f}`);
      if (f.endsWith(".exe")) {
        if (f.includes("Setup")) {
          fs.copyFileSync(srcPath, path.join(rootDistDir, "Anyong-DSH-windows-x64-Setup-1.0.0.exe"));
          console.log(`✓ Synced dist/Anyong-DSH-windows-x64-Setup-1.0.0.exe`);
        } else {
          fs.copyFileSync(srcPath, path.join(rootDistDir, "Anyong-DSH-windows-x64-1.0.0.exe"));
          console.log(`✓ Synced dist/Anyong-DSH-windows-x64-1.0.0.exe`);
        }
      }
    }
  }
}
