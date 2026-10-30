#requires -Version 5.1
<#
.SYNOPSIS
  检查仓库内 PowerShell 脚本是否能在 Windows PowerShell 5.1 上解析。

.DESCRIPTION
  桌面端在随包 PowerShell 无法启动时会回退到系统自带的 Windows PowerShell 5.1，
  所以 scripts/ 与 plugins/ 下的 .ps1 不能使用 PowerShell 7 独有的语法（空合并、三元运算符、
  空条件访问、并行 ForEach 等）。
  本脚本用 PSScriptAnalyzer 的 UseCompatibleSyntax 规则做静态门禁。

  依赖：PSScriptAnalyzer（模块）。安装：
    Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
    Install-Module PSScriptAnalyzer -RequiredVersion 1.25.0 -Scope CurrentUser -Force
#>
[CmdletBinding()]
param(
  [string[]]$Path = @('scripts', 'plugins'),
  [string]$SettingsPath = (Join-Path $PSScriptRoot 'psa/PSScriptAnalyzerSettings.psd1')
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

$module = Get-Module -ListAvailable -Name PSScriptAnalyzer | Sort-Object Version -Descending | Select-Object -First 1
if ($null -eq $module) {
  throw @'
PSScriptAnalyzer 未安装，无法检查 PowerShell 5.1 兼容性。请先执行：
  Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
  Install-Module PSScriptAnalyzer -RequiredVersion 1.25.0 -Scope CurrentUser -Force
'@
}
Import-Module $module.Path -Force

$root = Split-Path -Parent $PSScriptRoot
$targets = @(
  foreach ($item in $Path) {
    $resolved = Join-Path $root $item
    if (-not (Test-Path -LiteralPath $resolved)) { continue }
    $itemInfo = Get-Item -LiteralPath $resolved
    if ($itemInfo.PSIsContainer) {
      Get-ChildItem -LiteralPath $resolved -Recurse -Filter '*.ps1' -File
    } elseif ($itemInfo.Extension -eq '.ps1') {
      $itemInfo
    }
  }
)

if ($targets.Count -eq 0) {
  Write-Host '[ok] 未发现需要检查的 PowerShell 脚本'
  exit 0
}

Write-Host ("检查 {0} 个 PowerShell 脚本的 Windows PowerShell 5.1 兼容性（PSScriptAnalyzer {1}）" -f $targets.Count, $module.Version)
$findings = @(
  foreach ($file in $targets) {
    Invoke-ScriptAnalyzer -Path $file.FullName -Settings $SettingsPath -Severity Error -ErrorAction Stop |
      Where-Object { $_.RuleName -eq 'UseCompatibleSyntax' }
  }
)

if ($findings.Count -eq 0) {
  Write-Host '[ok] 全部脚本可在 Windows PowerShell 5.1 解析'
  exit 0
}

foreach ($finding in $findings) {
  $relative = $finding.ScriptPath
  if ($relative.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
    $relative = $relative.Substring($root.Length).TrimStart('\', '/')
  }
  Write-Host ("{0}:{1} {2}" -f $relative, $finding.Line, $finding.Message)
}

Write-Host ("[fail] 发现 {0} 处 Windows PowerShell 5.1 不兼容语法；回退链路会因此不可用" -f $findings.Count)
exit 1