[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$ArtifactPath,
  [switch]$KeepSandboxConfig,
  [switch]$NoWait
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  throw $Message
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$sandboxExe = Join-Path $env:WINDIR "System32\WindowsSandbox.exe"
if (-not (Test-Path -LiteralPath $sandboxExe)) {
  Fail "Windows Sandbox 未启用。请在 Windows 专业版/企业版/教育版中启用“Windows 沙盒”，并确认已开启硬件虚拟化。"
}

# 自动修复 .wsb 文件关联，防止 Windows 提示"没有应用商店 无法打开"
try {
  $regPath = "HKCU:\Software\Classes\.wsb"
  if (-not (Test-Path -LiteralPath $regPath)) {
    $null = New-Item -Path $regPath -Force
    Set-Item -Path $regPath -Value "Windows.SandboxFile"
  }
  [Microsoft.Win32.Registry]::SetValue("HKEY_CURRENT_USER\Software\Classes\Windows.SandboxFile\shell\open\command", "", "`"$sandboxExe`" `"%1`"")
} catch {
  Write-Verbose "注册 .wsb 关联跳过: $_"
}

# 检查主板 CPU 硬件虚拟化状态
$cpu = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
if ($cpu -and ($cpu.VirtualizationFirmwareEnabled -eq $false)) {
  Write-Warning "主板 BIOS/UEFI 中未启用 CPU 硬件虚拟化（AMD SVM / Intel VT-x）。"
  Write-Warning "Windows Sandbox 虚拟机启动需要硬件虚拟化支持。若启动报错 0x80370102，请在开机 BIOS 设置中开启 SVM/VT-x。"
  Write-Warning "提示：你也可以直接运行 'pnpm run test:clean-env'，在无需硬件虚拟化的完全隔离干净环境中测试与验收本软件。"
}

if ([string]::IsNullOrWhiteSpace($ArtifactPath)) {
  $candidates = @(
    Get-ChildItem -LiteralPath (Join-Path $repoRoot "dist") -Filter "*-windows-x64-installer-*.exe" -File -ErrorAction SilentlyContinue
    Get-ChildItem -LiteralPath (Join-Path $repoRoot "dist") -Filter "*-windows-x64-portable-*.zip" -File -ErrorAction SilentlyContinue
  ) | Sort-Object LastWriteTime -Descending
  if ($candidates.Count -eq 0) {
    Fail "没有找到测试产物。先运行 pnpm run dist:desktop，或把安装器/便携 ZIP 路径作为参数传入。"
  }
  $ArtifactPath = $candidates[0].FullName
}

$artifact = Get-Item -LiteralPath $ArtifactPath -ErrorAction Stop
if ($artifact.PSIsContainer -or $artifact.Extension.ToLowerInvariant() -notin @(".exe", ".zip")) {
  Fail "测试产物必须是 Windows 安装器 .exe 或便携版 .zip：$($artifact.FullName)"
}

$runRoot = Join-Path $env:TEMP ("anyong-clean-sandbox-" + [guid]::NewGuid().ToString("N"))
$null = New-Item -ItemType Directory -Path $runRoot
$null = Copy-Item -LiteralPath $artifact.FullName -Destination $runRoot
$artifactName = $artifact.Name

$launcher = @'
$ErrorActionPreference = "Stop"
$artifact = Join-Path "C:\TestInput" "__ARTIFACT_NAME__"
$localRoot = Join-Path $env:USERPROFILE "Desktop\Anyong Clean Test"
$null = New-Item -ItemType Directory -Force -Path $localRoot

if ([IO.Path]::GetExtension($artifact).ToLowerInvariant() -eq ".zip") {
  $portableRoot = Join-Path $localRoot "portable"
  Expand-Archive -LiteralPath $artifact -DestinationPath $portableRoot -Force
  $app = Get-ChildItem -LiteralPath $portableRoot -Filter "Anyong.exe" -File -Recurse | Select-Object -First 1
  if ($null -eq $app) { throw "便携 ZIP 中找不到 Anyong.exe" }
  Start-Process -FilePath $app.FullName
} else {
  Start-Process -FilePath $artifact
}

Write-Host "Anyong 已在干净 Windows Sandbox 中启动。"
Write-Host "关闭沙盒窗口后，本次测试环境和所有凭据会被销毁。"
'@.Replace("__ARTIFACT_NAME__", $artifactName)
$launcherPath = Join-Path $runRoot "launch-anyong.ps1"
Set-Content -LiteralPath $launcherPath -Value $launcher -Encoding UTF8 -NoNewline

$hostFolderXml = [System.Security.SecurityElement]::Escape($runRoot)
$wsb = @"
<Configuration>
  <VGpu>Disable</VGpu>
  <Networking>Enable</Networking>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$hostFolderXml</HostFolder>
      <SandboxFolder>C:\TestInput</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File C:\TestInput\launch-anyong.ps1</Command>
  </LogonCommand>
</Configuration>
"@
$wsbPath = Join-Path $runRoot "anyong-clean-test.wsb"
Set-Content -LiteralPath $wsbPath -Value $wsb -Encoding UTF8 -NoNewline

Write-Host "启动 Windows Sandbox：$($artifact.Name)"
if ($NoWait) {
  Start-Process -FilePath $sandboxExe -ArgumentList $wsbPath
  Write-Host "Windows Sandbox 已在后台启动。测试目录：$runRoot"
} else {
  try {
    Start-Process -FilePath $sandboxExe -ArgumentList $wsbPath -Wait
} finally {
  if ($KeepSandboxConfig) {
    Write-Host "保留沙盒配置：$runRoot"
  } else {
    Remove-Item -LiteralPath $runRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
}
