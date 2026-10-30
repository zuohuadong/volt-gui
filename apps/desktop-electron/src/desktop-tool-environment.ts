import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

export function mergeDshEnvironment(
  parent: Readonly<NodeJS.ProcessEnv>,
  overrides: Readonly<NodeJS.ProcessEnv> = {},
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of [...Object.entries(parent), ...Object.entries(overrides)]) {
    const normalized = platform === "win32" ? key.toUpperCase() : key;
    environment[normalized] = value;
  }
  // 独立解释器不继承宿主的启动注入和 Python 搜索路径。
  for (const key of ["NODE_OPTIONS", "NODE_PATH", "ELECTRON_RUN_AS_NODE", "PYTHONHOME", "PYTHONPATH"]) {
    delete environment[key];
  }
  return environment;
}

export function desktopToolPaths(root: string) {
  return {
    python: path.join(root, "python", "python.exe"),
    bun: path.join(root, "bun", "bun.exe"),
    coreutils: path.join(root, "coreutils", "coreutils.exe"),
    powershell: path.join(root, "powershell", "pwsh.exe"),
    manifest: path.join(root, "runtime.json"),
  };
}

export const desktopToolRequiredFiles = [
  "runtime.json",
  "python/python.exe",
  "python/python314.dll",
  "python/Lib/os.py",
  "python/Lib/site-packages/pip/__main__.py",
  "python/Lib/site-packages/rapidocr/models/PP-OCRv6_det_small.onnx",
  "python/Lib/site-packages/rapidocr/models/PP-OCRv6_rec_small.onnx",
  "python/Lib/site-packages/rapidocr/models/ch_ppocr_mobile_v2.0_cls_mobile.onnx",
  "python/Lib/site-packages/onnxruntime/capi/onnxruntime_pybind11_state.pyd",
  "python/Lib/site-packages/pypdfium2_raw/pdfium.dll",
  "bun/bun.exe",
  "coreutils/coreutils.exe",
  "coreutils/LICENSE",
  "powershell/pwsh.exe",
  "powershell/pwsh.dll",
  "powershell/pwsh.deps.json",
  "powershell/pwsh.runtimeconfig.json",
  "powershell/System.Management.Automation.dll",
] as const;

export function assertDesktopTools(root: string): void {
  for (const relative of desktopToolRequiredFiles) {
    const file = path.join(root, relative);
    if (!lstatSync(file, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Desktop tool runtime is incomplete: ${file}`);
    }
  }
  const manifest = JSON.parse(readFileSync(path.join(root, "runtime.json"), "utf8")) as {
    schemaVersion?: unknown; target?: unknown;
  };
  if (manifest.schemaVersion !== 1 || manifest.target !== `${process.platform}-${process.arch}`) {
    throw new Error("Desktop tool runtime target mismatch");
  }
}

export function desktopToolEnvironment(
  root: string,
  nodeExecutable: string,
  parent: Readonly<NodeJS.ProcessEnv> = process.env,
): NodeJS.ProcessEnv {
  assertDesktopTools(root);
  const tools = desktopToolPaths(root);
  const environment = mergeDshEnvironment(parent);
  const directories = [
    path.dirname(nodeExecutable),
    ...[tools.python, tools.bun, tools.coreutils, tools.powershell].map((file) => path.dirname(file)),
    ...(environment.PATH ?? "").split(path.delimiter),
  ];
  const seen = new Set<string>();
  environment.PATH = directories.filter((directory) => {
    if (!path.isAbsolute(directory)) return false;
    const key = path.normalize(directory).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(path.delimiter);
  return {
    ...environment,
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PIP_REQUIRE_VIRTUALENV: "true",
    POWERSHELL_TELEMETRY_OPTOUT: "1",
    POWERSHELL_UPDATECHECK: "Off",
    ANYONG_PYTHON_COMMAND: tools.python,
    ANYONG_BUN_COMMAND: tools.bun,
    ANYONG_COREUTILS_COMMAND: tools.coreutils,
    ANYONG_PWSH_PATH: tools.powershell,
    ANYONG_RUNTIME_MANIFEST: tools.manifest,
  };
}
