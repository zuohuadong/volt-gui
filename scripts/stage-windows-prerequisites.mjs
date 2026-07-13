#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const releaseAssets = Object.freeze({
  amd64: Object.freeze({
    vcRuntime: asset(
      'VC_redist.x64.exe',
      'https://download.visualstudio.microsoft.com/download/pr/7ebf5fdb-36dc-4145-b0a0-90d3d5990a61/CC0FF0EB1DC3F5188AE6300FAEF32BF5BEEBA4BDD6E8E445A9184072096B713B/VC_redist.x64.exe',
      'cc0ff0eb1dc3f5188ae6300faef32bf5beeba4bdd6e8e445a9184072096b713b',
    ),
    webview2: asset(
      'MicrosoftEdgeWebView2RuntimeInstallerX64.exe',
      'https://msedge.sf.dl.delivery.mp.microsoft.com/filestreamingservice/files/6c36e6de-67d8-470e-a071-894d02cd99eb/MicrosoftEdgeWebView2RuntimeInstallerX64.exe',
      '3a08103bed8a3d9aefdfc9ac10a672ea69605163f2dcb08d76cfd3e0444511c9',
    ),
  }),
  arm64: Object.freeze({
    vcRuntime: asset(
      'VC_redist.arm64.exe',
      'https://download.visualstudio.microsoft.com/download/pr/d7450eb5-03e1-436d-9e7e-deb5fe4759b3/5139E1440C3A20B92153A4DB561C069A0175AAF76C276C3E5B6F56099EDCF4B0/VC_redist.arm64.exe',
      '5139e1440c3a20b92153a4db561c069a0175aaf76c276c3e5b6f56099edcf4b0',
    ),
    webview2: asset(
      'MicrosoftEdgeWebView2RuntimeInstallerARM64.exe',
      'https://msedge.sf.dl.delivery.mp.microsoft.com/filestreamingservice/files/e957fa76-a5bf-402d-b45d-4e42529bc4a4/MicrosoftEdgeWebView2RuntimeInstallerARM64.exe',
      '39c7802ca48d340b54057451d68a129af982395220b6b17da6e1ee6c4fdde16e',
    ),
  }),
});

function asset(name, url, sha256Value) {
  return Object.freeze({ name, url, sha256: sha256Value });
}

export function assetsForTarget(target) {
  switch (target) {
    case 'windows/amd64':
    case 'windows/x64':
      return releaseAssets.amd64;
    case 'windows/arm64':
      return releaseAssets.arm64;
    default:
      throw new Error(`unsupported Windows prerequisites target: ${target}; expected windows/amd64 or windows/arm64`);
  }
}

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function verifyAsset(data, expected, label) {
  const actual = sha256(data);
  if (actual !== expected.toLowerCase()) {
    throw new Error(`${label} SHA-256 mismatch: got ${actual}, want ${expected}`);
  }
}

async function readVerifiedAsset(spec, cacheDir) {
  let data;
  let source;
  if (cacheDir) {
    const path = resolve(cacheDir, spec.name);
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new Error(`prerequisite asset directory does not contain ${spec.name}: ${path}`);
    }
    data = readFileSync(path);
    source = path;
  } else {
    const response = await fetch(spec.url, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`download ${spec.url}: HTTP ${response.status}`);
    }
    data = Buffer.from(await response.arrayBuffer());
    source = spec.url;
  }
  verifyAsset(data, spec.sha256, spec.name);
  return { data, source };
}

export function renderInstallScript(assets) {
  const lines = [
    '@echo off',
    'setlocal EnableExtensions',
    'cd /d "%~dp0"',
    'set "VOLTUI_RESTART_REQUIRED=0"',
    '',
    'fltmc >nul 2>&1',
    'if not errorlevel 1 goto admin_ready',
    'if /i "%~1"=="--elevated" (',
    '  echo [ERROR] Administrator privileges are required.',
    '  exit /b 740',
    ')',
    'echo Requesting administrator privileges...',
    'set "VOLTUI_PREREQ_SCRIPT=%~f0"',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process -FilePath $env:ComSpec -ArgumentList @(\'/d\',\'/c\',([char]34 + $env:VOLTUI_PREREQ_SCRIPT + [char]34 + \' --elevated\')) -Verb RunAs -Wait -PassThru; exit $p.ExitCode"',
    'exit /b %errorlevel%',
    '',
    ':admin_ready',
    `call :install_vc "${assets.vcRuntime.name}"`,
    'set "VOLTUI_EXIT_CODE=%errorlevel%"',
    'if not "%VOLTUI_EXIT_CODE%"=="0" goto failed',
    `call :install_webview2 "${assets.webview2.name}"`,
    'set "VOLTUI_EXIT_CODE=%errorlevel%"',
    'if not "%VOLTUI_EXIT_CODE%"=="0" goto failed',
    'if "%VOLTUI_RESTART_REQUIRED%"=="1" (',
    '  echo [OK] Prerequisites installed. Restart Windows before installing VoltUI.',
    '  exit /b 3010',
    ')',
    'echo [OK] Prerequisites are ready. You can now run the VoltUI installer.',
    'exit /b 0',
    '',
    ':failed',
    'echo [ERROR] Prerequisite installation failed with exit code %VOLTUI_EXIT_CODE%.',
    'exit /b %VOLTUI_EXIT_CODE%',
    '',
    ':install_vc',
    'echo Installing Microsoft Visual C++ 2015-2022 Redistributable...',
    '"%~dp0%~1" /install /quiet /norestart',
    'set "VOLTUI_EXIT_CODE=%errorlevel%"',
    'if "%VOLTUI_EXIT_CODE%"=="0" exit /b 0',
    'if "%VOLTUI_EXIT_CODE%"=="3010" goto restart_required',
    'if "%VOLTUI_EXIT_CODE%"=="1641" goto restart_required',
    'if "%VOLTUI_EXIT_CODE%"=="1638" goto already_installed',
    'if "%VOLTUI_EXIT_CODE%"=="-2147023258" goto already_installed',
    'exit /b %VOLTUI_EXIT_CODE%',
    '',
    ':install_webview2',
    'echo Installing Microsoft Edge WebView2 Evergreen Runtime...',
    '"%~dp0%~1" /silent /install',
    'set "VOLTUI_EXIT_CODE=%errorlevel%"',
    'if "%VOLTUI_EXIT_CODE%"=="0" exit /b 0',
    'if "%VOLTUI_EXIT_CODE%"=="3010" goto restart_required',
    'if "%VOLTUI_EXIT_CODE%"=="1641" goto restart_required',
    'if "%VOLTUI_EXIT_CODE%"=="-2147219198" goto already_installed',
    'if "%VOLTUI_EXIT_CODE%"=="2147748098" goto already_installed',
    'exit /b %VOLTUI_EXIT_CODE%',
    '',
    ':restart_required',
    'set "VOLTUI_RESTART_REQUIRED=1"',
    'exit /b 0',
    '',
    ':already_installed',
    'echo [OK] The same or a newer prerequisite is already installed.',
    'exit /b 0',
    '',
  ];
  return lines.join('\r\n');
}

function renderReadme(target, assets) {
  return [
    `VoltUI Windows 前置依赖离线包（${target}）`,
    '',
    '用途：供无法访问互联网的内网 Windows 电脑安装 VoltUI 所需的微软运行环境。',
    '请先安装此 prerequisites 包，再运行同一个 VoltUI 在线安装包；无需重复下载完整离线 VoltUI 安装器。',
    '',
    '安装步骤：',
    '1. 将整个 ZIP 解压到本地目录。',
    '2. 双击 install-prerequisites.cmd，并在 UAC 提示中允许管理员权限。',
    '3. 脚本会先安装 Microsoft Visual C++ 2015-2022 Redistributable，再安装 WebView2 Evergreen Runtime。',
    '4. 若提示需要重启，请重启 Windows 后再运行 VoltUI 安装器。',
    '',
    '故障排查：若安装器仍提示“应用程序的并行配置不正确”，先以管理员身份运行 sfc /scannow。',
    '内网环境需要继续用 DISM 修复时，请挂载与当前系统版本一致的 Windows ISO，并通过 /Source 与 /LimitAccess 指定离线源。',
    '',
    '文件来源与固定 SHA-256：',
    `- ${assets.vcRuntime.name}: ${assets.vcRuntime.url}`,
    `  ${assets.vcRuntime.sha256}`,
    `- ${assets.webview2.name}: ${assets.webview2.url}`,
    `  ${assets.webview2.sha256}`,
    '',
    '安装脚本会传播微软安装器的失败返回码；3010 表示安装成功但需要重启。',
    '',
  ].join('\r\n');
}

export async function stageWindowsPrerequisites(outDir, target, options = {}) {
  const assets = options.assets ?? assetsForTarget(target);
  const cacheDir = options.cacheDir ?? process.env.VOLTUI_WINDOWS_PREREQUISITES_ASSET_DIR;
  const [vcRuntime, webview2] = await Promise.all([
    readVerifiedAsset(assets.vcRuntime, cacheDir),
    readVerifiedAsset(assets.webview2, cacheDir),
  ]);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, assets.vcRuntime.name), vcRuntime.data, { mode: 0o755 });
  writeFileSync(resolve(outDir, assets.webview2.name), webview2.data, { mode: 0o755 });
  writeFileSync(resolve(outDir, 'install-prerequisites.cmd'), renderInstallScript(assets));
  writeFileSync(resolve(outDir, 'README.txt'), renderReadme(target, assets));
  writeFileSync(resolve(outDir, 'SHA256SUMS.txt'), [
    `${assets.vcRuntime.sha256}  ${assets.vcRuntime.name}`,
    `${assets.webview2.sha256}  ${assets.webview2.name}`,
    '',
  ].join('\r\n'));
  writeFileSync(resolve(outDir, 'metadata.json'), JSON.stringify({
    schemaVersion: 1,
    target,
    installOrder: ['vcRuntime', 'webview2'],
    assets,
    sources: { vcRuntime: vcRuntime.source, webview2: webview2.source },
  }, null, 2) + '\n');
  console.log(`staged Windows prerequisites for ${target} at ${outDir}`);
}

function isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const [outDir, target] = process.argv.slice(2);
  if (!outDir || !target) {
    console.error('usage: stage-windows-prerequisites.mjs <out-dir> <windows/arch>');
    process.exitCode = 2;
  } else {
    stageWindowsPrerequisites(resolve(outDir), target).catch((error) => {
      console.error(`stage Windows prerequisites: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
  }
}
