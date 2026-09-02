$ErrorActionPreference = "Stop"

$officeRoot = Split-Path -Parent (Resolve-Path "node_modules/@officecli/officecli/officecli.js")
$officeVendor = Join-Path $officeRoot "vendor"
$officeBinary = Join-Path $officeVendor "officecli.exe"
New-Item -ItemType Directory -Force -Path $officeVendor | Out-Null

$officeUrls = @(
  "https://d.officecli.ai/releases/download/v1.0.146/officecli-win-x64.exe",
  "https://github.com/iOfficeAI/OfficeCLI/releases/download/v1.0.146/officecli-win-x64.exe"
)
$downloaded = $false
foreach ($officeUrl in $officeUrls) {
  try {
    Invoke-WebRequest -Uri $officeUrl -OutFile $officeBinary -UseBasicParsing -TimeoutSec 300
    $downloaded = $true
    break
  } catch {
    Remove-Item -LiteralPath $officeBinary -Force -ErrorAction SilentlyContinue
  }
}
if (-not $downloaded) { throw "OfficeCLI binary download failed from all mirrors" }
if (-not (Test-Path $officeBinary)) { throw "OfficeCLI binary was not downloaded" }

$officeHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $officeBinary).Hash
if ($officeHash -ne "AD36CA99A50102D8F953E8ED1742FAB65C9E201A29733601EA6CA9E676B2EED0") {
  throw "OfficeCLI binary checksum mismatch"
}
Write-Output "OfficeCLI 1.0.146 Windows x64 binary installed and verified."
