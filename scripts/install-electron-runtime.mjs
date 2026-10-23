import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");

function positiveInteger(value, fallback, name) {
  const parsed = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function installElectronRuntime({
  electronPackage,
  environment = process.env,
  platform = environment.ELECTRON_INSTALL_PLATFORM || environment.npm_config_platform || process.platform,
  run = spawnSync,
}) {
  const platformPath = platform === "win32" ? "electron.exe"
    : ["darwin", "mas"].includes(platform) ? "Electron.app/Contents/MacOS/Electron" : "electron";
  const runtimeMarker = path.join(electronPackage, "dist", platformPath);
  const { version } = JSON.parse(fs.readFileSync(path.join(electronPackage, "package.json"), "utf8"));
  const isInstalled = () => {
    try {
      return fs.existsSync(runtimeMarker)
        && fs.readFileSync(path.join(electronPackage, "dist", "version"), "utf8").replace(/^v/, "") === version
        && fs.readFileSync(path.join(electronPackage, "path.txt"), "utf8") === platformPath;
    } catch {
      return false;
    }
  };
  if (isInstalled()) return runtimeMarker;

  const installScript = path.join(electronPackage, "install.js");
  if (!fs.existsSync(installScript)) throw new Error(`Electron installer was not found: ${installScript}`);
  const attempts = positiveInteger(environment.ELECTRON_INSTALL_ATTEMPTS, 3, "ELECTRON_INSTALL_ATTEMPTS");
  const timeout = positiveInteger(environment.ELECTRON_INSTALL_TIMEOUT_MS, 180_000, "ELECTRON_INSTALL_TIMEOUT_MS");
  const installEnvironment = {
    ...environment,
    ELECTRON_CACHE: environment.electron_config_cache || environment.ELECTRON_CACHE || path.join(root, ".cache", "electron"),
  };
  installEnvironment.electron_config_cache = installEnvironment.ELECTRON_CACHE;
  fs.mkdirSync(installEnvironment.ELECTRON_CACHE, { recursive: true });

  let lastFailure = "unknown error";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    console.log(`Installing Electron runtime (attempt ${attempt}/${attempts})`);
    const result = run(process.execPath, [installScript], {
      cwd: electronPackage,
      env: installEnvironment,
      stdio: "inherit",
      timeout,
      killSignal: "SIGKILL",
      windowsHide: true,
    });
    if (result.status === 0 && isInstalled()) return runtimeMarker;
    lastFailure = result.error?.code
      || (result.signal ? `terminated by ${result.signal}` : `exit code ${result.status}${result.status === 0 ? "; runtime incomplete" : ""}`);
  }
  throw new Error(`Electron runtime installation failed after ${attempts} attempts: ${lastFailure}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const require = createRequire(path.join(root, "apps", "desktop-electron", "package.json"));
  const electronPackage = path.dirname(require.resolve("electron/package.json"));
  installElectronRuntime({ electronPackage });
  console.log("Electron runtime is ready.");
}
