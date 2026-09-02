$ErrorActionPreference = "Stop"

$officeRoot = Split-Path -Parent (Resolve-Path "node_modules/@officecli/officecli/officecli.js")
$officeVendor = Join-Path $officeRoot "vendor"
$officeBinary = Join-Path $officeVendor "officecli.exe"
$expectedHash = "AD36CA99A50102D8F953E8ED1742FAB65C9E201A29733601EA6CA9E676B2EED0"
$cacheRoot = if ($env:CNB_OFFICECLI_CACHE) { $env:CNB_OFFICECLI_CACHE } else { "C:\data\orange-ci\tool-cache\officecli\1.0.146" }
$cacheBinary = Join-Path $cacheRoot "officecli.exe"
New-Item -ItemType Directory -Force -Path $officeVendor | Out-Null

if (Test-Path $cacheBinary) {
  $cacheHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $cacheBinary).Hash
  if ($cacheHash -eq $expectedHash) {
    Copy-Item -LiteralPath $cacheBinary -Destination $officeBinary -Force
    Write-Output "OfficeCLI 1.0.146 Windows x64 binary restored from runner cache."
    exit 0
  }
}

$officeUrls = @(
  "https://github.com/iOfficeAI/OfficeCLI/releases/download/v1.0.146/officecli-win-x64.exe",
  "https://d.officecli.ai/releases/download/v1.0.146/officecli-win-x64.exe"
)
$downloaded = $false
foreach ($officeUrl in $officeUrls) {
  Remove-Item -LiteralPath $officeBinary -Force -ErrorAction SilentlyContinue
  curl.exe --location --fail --retry 2 --retry-delay 2 --connect-timeout 20 --max-time 300 --output $officeBinary $officeUrl
  if ($LASTEXITCODE -eq 0 -and (Test-Path $officeBinary)) {
    $downloaded = $true
    break
  }
}
if (-not $downloaded) { throw "OfficeCLI binary download failed from all mirrors" }
if (-not (Test-Path $officeBinary)) { throw "OfficeCLI binary was not downloaded" }

$officeHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $officeBinary).Hash
if ($officeHash -ne $expectedHash) {
  throw "OfficeCLI binary checksum mismatch"
}
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
Copy-Item -LiteralPath $officeBinary -Destination $cacheBinary -Force
Write-Output "OfficeCLI 1.0.146 Windows x64 binary installed and verified."
