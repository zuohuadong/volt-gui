#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");

const boundaryFiles = {
  electronHtml: "apps/desktop-frontend/electron.html",
  electronEntry: "apps/desktop-frontend/src/electron-main.ts",
  electronWorkbench: "apps/desktop-frontend/src/components/ElectronWorkbench.svelte",
  electronMain: "apps/desktop-electron/src/main.ts",
  electronPreload: "apps/desktop-electron/src/preload.ts",
  electronFallback: "apps/desktop-electron/src/workbench.html",
  electronBuild: "apps/desktop-electron/scripts/build-frontend.mjs",
  dshServer: "packages/dsh-server/src/server.ts",
};

function addFinding(findings, file, rule, message) {
  findings.push({ file, rule, message });
}

async function sourceFiles(root) {
  return Object.fromEntries(await Promise.all(
    Object.entries(boundaryFiles).map(async ([name, relativePath]) => [
      name,
      await readFile(path.join(root, relativePath), "utf8"),
    ]),
  ));
}

function scanRendererSources(findings, sources) {
  const rendererSources = [
    [boundaryFiles.electronEntry, sources.electronEntry],
    [boundaryFiles.electronWorkbench, sources.electronWorkbench],
  ];
  const forbidden = [
    ["wails-global", /window\.go\b/, "Electron 渲染层不能访问 window.go。"],
    ["legacy-bridge-import", /(?:lib\/bridge|from\s+["'][^"']*bridge["'])/, "Electron 渲染层不能导入旧 bridge。"],
    ["mock-app", /\bmakeMockApp\b/, "Electron 渲染层不能构造 mock app。"],
    ["legacy-app-call", /\bapp\s*\(\s*\)/, "Electron 渲染层不能调用旧 app() 绑定。"],
    ["legacy-app-component", /App\.svelte/, "Electron 入口不能加载旧 App.svelte。"],
    ["optional-preload-call", /electronApi\?\./, "Electron 按钮不能静默跳过 preload 调用。"],
  ];

  for (const [file, source] of rendererSources) {
    for (const [rule, pattern, message] of forbidden) {
      if (pattern.test(source)) addFinding(findings, file, rule, message);
    }
  }

  for (const match of sources.electronWorkbench.matchAll(/<button\b([^>]*)>/gi)) {
    if (!/\bonclick\s*=/.test(match[1])) {
      addFinding(findings, boundaryFiles.electronWorkbench, "button-without-action", "Electron 工作台按钮必须绑定明确动作。");
    }
  }
}

function scanEntrypoints(findings, sources) {
  if (!/src\/electron-main\.ts/.test(sources.electronHtml)) {
    addFinding(findings, boundaryFiles.electronHtml, "wrong-renderer-entry", "Electron HTML 必须使用专用 electron-main.ts 入口。");
  }
  if (!/renderer["'],\s*["']electron\.html/.test(sources.electronMain)) {
    addFinding(findings, boundaryFiles.electronMain, "wrong-main-entry", "Electron 主进程必须只加载 renderer/electron.html。");
  }
  if (/htmlCandidates|src["'],\s*["']workbench\.html/.test(sources.electronMain)) {
    addFinding(findings, boundaryFiles.electronMain, "legacy-renderer-fallback", "Electron 主进程不能搜索旧功能工作台入口。");
  }
  if (!/dist-electron/.test(sources.electronBuild)) {
    addFinding(findings, boundaryFiles.electronBuild, "shared-renderer-build", "Electron 构建必须复制独立的 dist-electron 产物。");
  }
}

function scanLocalServiceBoundary(findings, sources) {
  if (/Access-Control-Allow-Origin["'],\s*["']\*/.test(sources.dshServer)) {
    addFinding(findings, boundaryFiles.dshServer, "wildcard-local-cors", "本机 DSH 服务不能向任意网页开放 CORS。");
  }
  for (const [pattern, rule, message] of [
    [/authToken:\s*serverAccessToken/, "missing-session-token", "Electron DSH 服务必须使用每进程随机访问令牌。"],
    [/allowedOrigins:\s*\[\s*["']null["']\s*\]/, "missing-origin-allowlist", "Electron DSH 服务必须限制为本地文件渲染 Origin。"],
    [/restartQueue\.then/, "unserialized-restart", "Electron DSH 重启必须串行化，避免遗留旧服务。"],
  ]) {
    if (!pattern.test(sources.electronMain)) addFinding(findings, boundaryFiles.electronMain, rule, message);
  }
  for (const [pattern, rule, message] of [
    [/Bearer \$\{authToken\}/, "missing-bearer-auth", "DSH 服务必须校验 bearer token。"],
    [/maxRequestBodyBytes/, "missing-request-limit", "DSH 服务必须限制请求体大小。"],
    [/closeAllConnections/, "unbounded-server-stop", "DSH 服务关闭必须有强制回收残留连接的路径。"],
  ]) {
    if (!pattern.test(sources.dshServer)) addFinding(findings, boundaryFiles.dshServer, rule, message);
  }
  if (!/getServerConnection/.test(sources.electronPreload) || /getServerUrl/.test(sources.electronPreload)) {
    addFinding(findings, boundaryFiles.electronPreload, "unsafe-server-discovery", "preload 必须只暴露带会话令牌的 DSH 连接描述。");
  }
}

function scanFallback(findings, source) {
  const forbidden = [
    ["fallback-button", /<button\b/i, "故障页不能保留伪功能按钮。"],
    ["fallback-runtime", /electronDsh|window\.go|\/api\//, "故障页不能实现第二套运行时桥接。"],
    ["fallback-mock", /makeMockApp|mock bridge|模拟成功/i, "故障页不能包含 mock 行为。"],
  ];
  for (const [rule, pattern, message] of forbidden) {
    if (pattern.test(source)) addFinding(findings, boundaryFiles.electronFallback, rule, message);
  }
}

export async function scanElectronRuntimeBoundary({ root = repositoryRoot } = {}) {
  const sources = await sourceFiles(root);
  const findings = [];
  scanRendererSources(findings, sources);
  scanEntrypoints(findings, sources);
  scanLocalServiceBoundary(findings, sources);
  scanFallback(findings, sources.electronFallback);
  return findings;
}

async function main() {
  const findings = await scanElectronRuntimeBoundary();
  if (findings.length === 0) {
    console.log("Electron runtime boundary check passed.");
    return;
  }
  for (const finding of findings) {
    console.error(`${finding.file}: ${finding.message} [${finding.rule}]`);
  }
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
