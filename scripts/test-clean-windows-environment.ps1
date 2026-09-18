[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$ArtifactPath,
  [switch]$Interactive,
  [switch]$KeepEnvironment
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  throw $Message
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$runRoot = Join-Path $env:TEMP ("ay-c-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
$cleanUserProfile = Join-Path $runRoot "UserProfile"
$cleanAppData = Join-Path $cleanUserProfile "AppData\Roaming"
$cleanLocalAppData = Join-Path $cleanUserProfile "AppData\Local"
$cleanDshHome = Join-Path $cleanAppData "Anyong\dsh"
$cleanAppDir = Join-Path $runRoot "app"

$null = New-Item -ItemType Directory -Force -Path $cleanUserProfile
$null = New-Item -ItemType Directory -Force -Path $cleanAppData
$null = New-Item -ItemType Directory -Force -Path $cleanLocalAppData
$null = New-Item -ItemType Directory -Force -Path $cleanDshHome
$null = New-Item -ItemType Directory -Force -Path $cleanAppDir

Write-Host "=========================================================="
Write-Host " 开启干净隔离环境测试（零环境变量、全新隔离数据目录）"
Write-Host " 隔离目录: $runRoot"
Write-Host "=========================================================="

$exePath = $null
if (-not [string]::IsNullOrWhiteSpace($ArtifactPath) -and (Test-Path -LiteralPath $ArtifactPath)) {
  $ext = [IO.Path]::GetExtension($ArtifactPath).ToLowerInvariant()
  if ($ext -eq ".zip") {
    Write-Host "解压便携测试包: $ArtifactPath ..."
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ArtifactPath, $cleanAppDir)
    $app = Get-ChildItem -LiteralPath $cleanAppDir -Filter "Anyong.exe" -File -Recurse | Select-Object -First 1
    if ($null -eq $app) { Fail "便携包中未找到 Anyong.exe" }
    $exePath = $app.FullName
  } elseif ($ext -eq ".exe" -and [IO.Path]::GetFileName($ArtifactPath).ToLowerInvariant() -eq "anyong.exe") {
    $exePath = $ArtifactPath
  }
}

if ($null -eq $exePath) {
  $unpacked = Join-Path $repoRoot "apps\desktop-electron\dist-package\win-unpacked\Anyong.exe"
  if (Test-Path -LiteralPath $unpacked) {
    Write-Host "使用免安装打包产物: $unpacked"
    $exePath = $unpacked
  } else {
    $candidates = @(
      Get-ChildItem -LiteralPath (Join-Path $repoRoot "dist") -Filter "*-windows-x64-portable-*.zip" -File -ErrorAction SilentlyContinue
    ) | Sort-Object LastWriteTime -Descending
    if ($candidates.Count -gt 0) {
      Write-Host "解压便携产物: $($candidates[0].FullName) ..."
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      [System.IO.Compression.ZipFile]::ExtractToDirectory($candidates[0].FullName, $cleanAppDir)
      $app = Get-ChildItem -LiteralPath $cleanAppDir -Filter "Anyong.exe" -File -Recurse | Select-Object -First 1
      if ($null -eq $app) { Fail "便携包中未找到 Anyong.exe" }
      $exePath = $app.FullName
    } else {
      Fail "未找到可测试产物。请先运行 pnpm run dist:desktop 或传入产物路径。"
    }
  }
}

$resourcesDir = Join-Path (Split-Path -Parent $exePath) "resources"
$bundledEnvPath = Join-Path $resourcesDir "bundled.env"
if (Test-Path -LiteralPath $bundledEnvPath) {
  Write-Host "✓ 验证目标应用存在内置凭据 sidecar: $bundledEnvPath"
} else {
  Write-Warning "! 目标应用缺少 resources/bundled.env，可能尚未注入完整凭据打包"
}

$targetCredentialsFile = Join-Path $cleanDshHome ".credentials.yaml"
if (Test-Path -LiteralPath $targetCredentialsFile) {
  Fail "干净环境初始化失败：存在旧凭据文件 $targetCredentialsFile"
}
Write-Host "✓ 初始环境已彻底清空凭据，验证零环境变量启动..."

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $exePath
$psi.WorkingDirectory = Split-Path -Parent $exePath
$psi.UseShellExecute = $false
$psi.EnvironmentVariables["USERPROFILE"] = $cleanUserProfile
$psi.EnvironmentVariables["APPDATA"] = $cleanAppData
$psi.EnvironmentVariables["LOCALAPPDATA"] = $cleanLocalAppData
$psi.EnvironmentVariables["DSH_HOME"] = $cleanDshHome

$keysToClear = @(
  "XG_GOMODEL_API_KEY", "XG_GOMODEL_ENDPOINT", "volt_API_KEY", "VOLT_API_KEY",
  "volt_MODEL_BASE_URL", "VOLT_MODEL_BASE_URL", "XIGU_API_KEY", "XIGU_MODEL_BASE_URL",
  "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY"
)
foreach ($k in $keysToClear) {
  $psi.EnvironmentVariables.Remove($k)
  $psi.EnvironmentVariables[$k] = ""
}

Write-Host "启动应用程序: $exePath"
$proc = [System.Diagnostics.Process]::Start($psi)
if ($null -eq $proc) { Fail "无法启动进程 $exePath" }

try {
  if ($Interactive) {
    Write-Host "已在干净隔离环境中打开应用窗口。请在界面上测试，关闭窗口后将自动清理测试目录。"
    $proc.WaitForExit()
  } else {
    Write-Host "等待应用初始化并写入 DSH 凭据 (最多等待 30 秒)..."
    $waited = 0
    $provisioned = $false
    while ($waited -lt 30) {
      Start-Sleep -Seconds 2
      $waited += 2
      if (Test-Path -LiteralPath $targetCredentialsFile) {
        $provisioned = $true
        break
      }
      if ($proc.HasExited) {
        break
      }
    }

    if ($provisioned) {
      Write-Host "✓ 验证通过：官方 DSH 凭据文件已在干净目录中成功生成: $targetCredentialsFile"
      $credContent = Get-Content -LiteralPath $targetCredentialsFile -Raw
      if ($credContent -match "XG_GOMODEL_API_KEY") {
        Write-Host "✓ 验证通过：已成功将内置 Key 注入 DSH 凭据系统（无需任何用户环境变量）"
      } else {
        Write-Warning "! 凭据文件中缺少 XG_GOMODEL_API_KEY"
      }
    } else {
      if ($proc.HasExited) {
        Fail "应用程序在初始化完成前异常退出，退出码: $($proc.ExitCode)"
      } else {
        Fail "超时未能在干净目录检测到 DSH 凭据生成"
      }
    }

    $verifyScript = Join-Path $repoRoot "scripts\verify-clean-model-gateway.mjs"
    node $verifyScript $targetCredentialsFile
    if ($LASTEXITCODE -eq 0) {
      Write-Host "✓ 验证通过：干净环境应用成功与模型网关完成握手并跑通真实推理！"
    } else {
      Fail "模型网关握手或真实推理测试失败"
    }
  }
} finally {
  if (-not $proc.HasExited) {
    Write-Host "正在关闭测试进程..."
    $proc.Kill()
    $proc.WaitForExit(5000) | Out-Null
  }
  if ($KeepEnvironment) {
    Write-Host "保留隔离环境数据: $runRoot"
  } else {
    Write-Host "清理隔离环境临时数据..."
    Remove-Item -LiteralPath $runRoot -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "✓ 测试环境已完全销毁"
  }
}

Write-Host "=========================================================="
Write-Host " 干净隔离环境测试完成：全部验收项 PASS"
Write-Host "=========================================================="
