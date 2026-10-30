param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('status', 'open', 'export-pdf', 'save', 'close', 'convert', 'cleanup')]
  [string]$Action,
  [string]$Path = '',
  [string]$Output = '',
  [string]$App = 'auto',
  [string]$Vendor = 'auto',
  [string]$PidFile = '',
  [switch]$Visible,
  [switch]$Private,
  [switch]$Save,
  [switch]$Overwrite
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

function Write-Result([hashtable]$Value) {
  Write-Output ($Value | ConvertTo-Json -Depth 6 -Compress)
}

function Get-AppSpecs {
  return @(
    @{ id = 'word'; vendor = 'microsoft'; kind = 'word'; name = 'Microsoft Word'; progIds = @('Word.Application') },
    @{ id = 'excel'; vendor = 'microsoft'; kind = 'excel'; name = 'Microsoft Excel'; progIds = @('Excel.Application') },
    @{ id = 'powerpoint'; vendor = 'microsoft'; kind = 'powerpoint'; name = 'Microsoft PowerPoint'; progIds = @('PowerPoint.Application') },
    @{ id = 'wps-writer'; vendor = 'wps'; kind = 'word'; name = 'WPS Writer'; progIds = @('KWPS.Application', 'WPS.Application') },
    @{ id = 'wps-spreadsheet'; vendor = 'wps'; kind = 'excel'; name = 'WPS Spreadsheets'; progIds = @('KET.Application', 'ET.Application') },
    @{ id = 'wps-presentation'; vendor = 'wps'; kind = 'powerpoint'; name = 'WPS Presentation'; progIds = @('KWPP.Application', 'WPP.Application') }
  )
}

function Get-Kind([string]$FilePath) {
  switch ([IO.Path]::GetExtension($FilePath).ToLowerInvariant()) {
    '.doc' { return 'word' }
    '.docx' { return 'word' }
    '.docm' { return 'word' }
    '.rtf' { return 'word' }
    '.odt' { return 'word' }
    '.xls' { return 'excel' }
    '.xlsx' { return 'excel' }
    '.xlsm' { return 'excel' }
    '.csv' { return 'excel' }
    '.ods' { return 'excel' }
    '.ppt' { return 'powerpoint' }
    '.pptx' { return 'powerpoint' }
    '.pptm' { return 'powerpoint' }
    '.odp' { return 'powerpoint' }
    default { return '' }
  }
}

function Get-Conversion([string]$FilePath) {
  switch ([IO.Path]::GetExtension($FilePath).ToLowerInvariant()) {
    '.doc' { return @{ targetExtension = '.docx'; fileFormat = 16 } }
    '.xls' { return @{ targetExtension = '.xlsx'; fileFormat = 51 } }
    '.ppt' { return @{ targetExtension = '.pptx'; fileFormat = 24 } }
    default { return $null }
  }
}

function Resolve-AppSpec([string]$RequestedApp, [string]$RequestedVendor, [string]$FilePath) {
  $specs = Get-AppSpecs
  if ($RequestedApp -and $RequestedApp -ne 'auto') {
    $match = $specs | Where-Object { $_.id -eq $RequestedApp } | Select-Object -First 1
    if ($null -eq $match) { throw "Unknown app: $RequestedApp" }
    return $match
  }
  $kind = Get-Kind $FilePath
  if (-not $kind) { throw "Unsupported Office document extension: $FilePath" }
  if ($RequestedVendor -eq 'wps') {
    return $specs | Where-Object { $_.vendor -eq 'wps' -and $_.kind -eq $kind } | Select-Object -First 1
  }
  if ($RequestedVendor -eq 'microsoft') {
    return $specs | Where-Object { $_.vendor -eq 'microsoft' -and $_.kind -eq $kind } | Select-Object -First 1
  }
  # Prefer Microsoft Office when both suites are installed; callers can force WPS.
  return $specs | Where-Object { $_.vendor -eq 'microsoft' -and $_.kind -eq $kind } | Select-Object -First 1
}

function Get-WindowProcessId([int64]$Handle) {
  if ($Handle -eq 0) { return 0 }
  try {
    if (-not ('AnyongOfficeNative.User32' -as [type])) {
      Add-Type -Namespace AnyongOfficeNative -Name User32 -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint lpdwProcessId);
'@
    }
    $processId = [uint32]0
    [void][AnyongOfficeNative.User32]::GetWindowThreadProcessId([IntPtr]$Handle, [ref]$processId)
    return [int]$processId
  } catch {
    return 0
  }
}

function Get-SpecProcessNames([hashtable]$Spec) {
  if ($Spec.vendor -eq 'wps') {
    switch ($Spec.kind) {
      'word' { return @('wps.exe') }
      'excel' { return @('et.exe') }
      'powerpoint' { return @('wpp.exe', 'wps.exe') }
    }
  }
  switch ($Spec.kind) {
    'word' { return @('winword.exe') }
    'excel' { return @('excel.exe') }
    'powerpoint' { return @('powerpnt.exe') }
  }
  return @()
}

function Get-SpecProcesses([hashtable]$Spec) {
  try {
    $names = Get-SpecProcessNames $Spec
    return @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop | Where-Object {
      $null -ne $_.Name -and $names -contains $_.Name.ToLowerInvariant()
    })
  } catch {
    throw 'Cannot inspect Office process ownership'
  }
}

function Get-OwnerProcessId([hashtable]$Spec, $InstanceApp, [int[]]$BeforeProcessIds) {
  $new = @(Get-SpecProcesses $Spec | Where-Object { $BeforeProcessIds -notcontains [int]$_.ProcessId })
  $fromWindow = 0
  try { $fromWindow = Get-WindowProcessId ([int64]$InstanceApp.Hwnd) } catch { $fromWindow = 0 }
  if ($fromWindow -gt 0) {
    if (@($new | Where-Object { [int]$_.ProcessId -eq $fromWindow }).Count -eq 1) { return $fromWindow }
    return 0
  }
  # PowerPoint may have no window yet; ambiguous process creation fails closed.
  $owned = @($new | Where-Object { [int]$_.ParentProcessId -eq $PID })
  if ($owned.Count -eq 1) { return [int]$owned[0].ProcessId }
  return 0
}

function Get-OwnerRecord {
  if (-not $PidFile) { return $null }
  if (-not (Test-Path -LiteralPath $PidFile -PathType Leaf)) { return $null }
  try {
    return (Get-Content -LiteralPath $PidFile -Raw -Encoding UTF8 | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Remove-OwnerRecord {
  if (-not $PidFile) { return }
  try { Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue } catch { }
}

function Get-OwnerIdentity([hashtable]$Spec, [int]$ProcessId) {
  if ($ProcessId -le 0) { return $null }
  try {
    $process = Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId=' + $ProcessId) -ErrorAction Stop
    $expectedNames = Get-SpecProcessNames $Spec
    if ($null -ne $process -and $process.CreationDate -and ($expectedNames -contains ([string]$process.Name).ToLowerInvariant())) {
      return @{ creationDate = [string]$process.CreationDate; processName = [string]$process.Name; parentProcessId = [int]$process.ParentProcessId }
    }
  } catch { }
  return $null
}

function Test-OwnerIdentity([hashtable]$Spec, [int]$ProcessId, $Identity) {
  if ($null -eq $Identity -or -not $Identity.creationDate -or -not $Identity.processName -or $null -eq $Identity.parentProcessId) { return $false }
  $current = Get-OwnerIdentity $Spec $ProcessId
  return ($null -ne $current -and $current.creationDate -eq $Identity.creationDate -and $current.processName -eq $Identity.processName -and $current.parentProcessId -eq [int]$Identity.parentProcessId)
}

function Write-OwnerRecord([hashtable]$Instance, [hashtable]$Spec) {
  if (-not $PidFile -or -not $Instance.created) { return }
  if (-not (Test-OwnerIdentity $Spec $Instance.pid $Instance.identity)) { return }
  $record = @{
    pid = [int]$Instance.pid
    app = $Spec.id
    name = $Spec.name
    recordedAt = (Get-Date).ToUniversalTime().ToString('o')
    creationDate = $Instance.identity.creationDate
    processName = $Instance.identity.processName
    parentProcessId = $Instance.identity.parentProcessId
  }
  try {
    $parent = [IO.Path]::GetDirectoryName($PidFile)
    if ($parent -and -not (Test-Path -LiteralPath $parent)) { [void](New-Item -ItemType Directory -Path $parent -Force) }
    ($record | ConvertTo-Json -Depth 4 -Compress) | Set-Content -LiteralPath $PidFile -Encoding UTF8
  } catch { }
}

# Kill the background instance recorded by this run. The creation time is
# compared before stopping anything, so a recycled PID is never a target.
function Stop-RecordedOwner {
  $record = Get-OwnerRecord
  if ($null -eq $record) {
    Remove-OwnerRecord
    return @{ ok = $true; killed = $false; reason = 'no-record' }
  }
  $targetPid = 0
  try { $targetPid = [int]$record.pid } catch { $targetPid = 0 }
  if ($targetPid -le 0) {
    Remove-OwnerRecord
    return @{ ok = $true; killed = $false; reason = 'no-pid' }
  }
  $spec = $null
  try { $spec = Resolve-AppSpec ([string]$record.app) 'auto' '' } catch { }
  $killed = $false
  try {
    if ($null -ne $spec -and (Test-OwnerIdentity $spec $targetPid $record)) {
      Stop-Process -Id $targetPid -Force -ErrorAction Stop
      $killed = $true
    }
  } catch { }
  Remove-OwnerRecord
  return @{ ok = $true; killed = $killed; pid = $targetPid }
}

function New-AppInstance([hashtable]$Spec, [bool]$AllowAttach) {
  foreach ($progId in $Spec.progIds) {
    if ($AllowAttach) {
      try {
        $active = [Runtime.InteropServices.Marshal]::GetActiveObject($progId)
        if ($null -ne $active) {
          return @{ app = $active; created = $false; pid = 0; progId = $progId }
        }
      } catch { }
    }
    try {
      $type = [Type]::GetTypeFromProgID($progId)
      if ($null -ne $type) {
        $before = @(Get-SpecProcesses $Spec | ForEach-Object { [int]$_.ProcessId })
        $created = [Activator]::CreateInstance($type)
        $ownerPid = 0
        for ($attempt = 0; $attempt -lt 20 -and $ownerPid -le 0; $attempt++) {
          $ownerPid = Get-OwnerProcessId $Spec $created $before
          if ($ownerPid -le 0) { Start-Sleep -Milliseconds 100 }
        }
        $identity = Get-OwnerIdentity $Spec $ownerPid
        if (-not (Test-OwnerIdentity $Spec $ownerPid $identity)) {
          try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($created) } catch { }
          throw 'Cannot prove ownership of the new Office instance; refusing automation'
        }
        return @{ app = $created; created = $true; pid = $ownerPid; identity = $identity; progId = $progId; spec = $Spec }
      }
    } catch { }
  }
  throw "Office application is not installed or cannot be started: $($Spec.name)"
}

function Close-AppInstance([hashtable]$Instance) {
  if ($null -eq $Instance -or $null -eq $Instance.app) { return }
  if ($Instance.created -and -not (Test-OwnerIdentity $Instance.spec $Instance.pid $Instance.identity)) {
    try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($Instance.app) } catch { }
    return
  }
  if ($Instance.created) {
    try { $Instance.app.Quit() } catch { }
  }
  try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($Instance.app) } catch { }
  # A hidden automation instance can outlive Quit(); stop the process we created
  # so a stuck workbook never leaves a zombie EXCEL.EXE holding the file.
  if ($Instance.created -and $Instance.pid -gt 0) {
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      if (-not (Test-OwnerIdentity $Instance.spec $Instance.pid $Instance.identity)) { return }
      Start-Sleep -Milliseconds 250
    }
    if (Test-OwnerIdentity $Instance.spec $Instance.pid $Instance.identity) {
      try { Stop-Process -Id $Instance.pid -Force -ErrorAction Stop } catch { }
    }
  }
}

# Disable dialogs, link prompts and recalculation for background automation.
function Set-BackgroundMode([hashtable]$Spec, $InstanceApp) {
  $restore = @{}
  $alertsOff = 0
  if ($Spec.kind -eq 'powerpoint') { $alertsOff = 1 }
  try { $restore['displayAlerts'] = $InstanceApp.DisplayAlerts; $InstanceApp.DisplayAlerts = $alertsOff } catch { }
  try { $InstanceApp.Visible = $false } catch { }
  try { $restore['enableEvents'] = $InstanceApp.EnableEvents; $InstanceApp.EnableEvents = $false } catch { }
  try { $restore['askToUpdateLinks'] = $InstanceApp.AskToUpdateLinks; $InstanceApp.AskToUpdateLinks = $false } catch { }
  try { $restore['screenUpdating'] = $InstanceApp.ScreenUpdating; $InstanceApp.ScreenUpdating = $false } catch { }
  try { $restore['calculation'] = $InstanceApp.Calculation; $InstanceApp.Calculation = -4135 } catch { }
  try { $restore['automationSecurity'] = $InstanceApp.AutomationSecurity; $InstanceApp.AutomationSecurity = 3 } catch { }
  try { $restore['alertBeforeOverwriting'] = $InstanceApp.AlertBeforeOverwriting; $InstanceApp.AlertBeforeOverwriting = $false } catch { }
  return $restore
}

function Restore-BackgroundMode($InstanceApp, $Restore) {
  if ($null -eq $Restore) { return }
  try { if ($Restore.ContainsKey('displayAlerts')) { $InstanceApp.DisplayAlerts = $Restore['displayAlerts'] } } catch { }
  try { if ($Restore.ContainsKey('enableEvents')) { $InstanceApp.EnableEvents = $Restore['enableEvents'] } } catch { }
  try { if ($Restore.ContainsKey('askToUpdateLinks')) { $InstanceApp.AskToUpdateLinks = $Restore['askToUpdateLinks'] } } catch { }
  try { if ($Restore.ContainsKey('screenUpdating')) { $InstanceApp.ScreenUpdating = $Restore['screenUpdating'] } } catch { }
  try { if ($Restore.ContainsKey('calculation')) { $InstanceApp.Calculation = $Restore['calculation'] } } catch { }
  try { if ($Restore.ContainsKey('automationSecurity')) { $InstanceApp.AutomationSecurity = $Restore['automationSecurity'] } } catch { }
  try { if ($Restore.ContainsKey('alertBeforeOverwriting')) { $InstanceApp.AlertBeforeOverwriting = $Restore['alertBeforeOverwriting'] } } catch { }
}

function Open-Document([hashtable]$Instance, [hashtable]$Spec, [string]$FilePath, [bool]$ShowWindow) {
  $app = $Instance.app
  if ($ShowWindow) { try { $app.Visible = $true } catch { } }
  switch ($Spec.kind) {
    # UpdateLinks=0 keeps stale external links from blocking on a dialog.
    'word' { return $app.Documents.Open($FilePath, $false, $false, $false) }
    'excel' { return $app.Workbooks.Open($FilePath, 0, $false) }
    'powerpoint' { return $app.Presentations.Open($FilePath, $false, $false, $ShowWindow) }
    default { throw "Unsupported document kind: $($Spec.kind)" }
  }
}

function Find-OpenDocument([hashtable]$Instance, [hashtable]$Spec, [string]$FilePath) {
  $app = $Instance.app
  $wanted = [IO.Path]::GetFullPath($FilePath)
  switch ($Spec.kind) {
    'word' { $items = $app.Documents }
    'excel' { $items = $app.Workbooks }
    'powerpoint' { $items = $app.Presentations }
    default { return $null }
  }
  foreach ($item in $items) {
    try {
      if ([string]::Equals([IO.Path]::GetFullPath([string]$item.FullName), $wanted, [StringComparison]::OrdinalIgnoreCase)) {
        return $item
      }
    } catch { }
  }
  return $null
}

function Export-DocumentAsPdf([hashtable]$Spec, $Document, [string]$OutputPath) {
  $parent = [IO.Path]::GetDirectoryName($OutputPath)
  if ($parent -and -not (Test-Path -LiteralPath $parent)) { [void](New-Item -ItemType Directory -Path $parent -Force) }
  switch ($Spec.kind) {
    'word' {
      try { $Document.ExportAsFixedFormat($OutputPath, 17) }
      catch { $Document.SaveAs([ref]$OutputPath, [ref]17) }
    }
    'excel' {
      $Document.ExportAsFixedFormat(0, $OutputPath)
    }
    'powerpoint' {
      try { $Document.SaveAs($OutputPath, 32) }
      catch { $Document.ExportAsFixedFormat($OutputPath, 2) }
    }
    default { throw "Unsupported document kind: $($Spec.kind)" }
  }
}

function Save-ConvertedDocument([hashtable]$Spec, $Document, [string]$OutputPath, [int]$FileFormat) {
  $parent = [IO.Path]::GetDirectoryName($OutputPath)
  if ($parent -and -not (Test-Path -LiteralPath $parent)) { [void](New-Item -ItemType Directory -Path $parent -Force) }
  switch ($Spec.kind) {
    'word' {
      try { $Document.SaveAs2($OutputPath, $FileFormat) }
      catch { $Document.SaveAs([ref]$OutputPath, [ref]$FileFormat) }
    }
    'excel' {
      try { $Document.SaveAs($OutputPath, $FileFormat) }
      catch { $Document.SaveAs([ref]$OutputPath, [ref]$FileFormat) }
    }
    'powerpoint' {
      try { $Document.SaveAs($OutputPath, $FileFormat) }
      catch { $Document.SaveAs([ref]$OutputPath, [ref]$FileFormat) }
    }
    default { throw "Unsupported document kind: $($Spec.kind)" }
  }
}

function Assert-File([string]$FilePath) {
  if (-not $FilePath -or -not [IO.Path]::IsPathRooted($FilePath)) { throw 'An absolute document path is required' }
  if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) { throw "Document not found: $FilePath" }
}

try {
  if ($Action -eq 'cleanup') {
    Write-Result (Stop-RecordedOwner)
    exit 0
  }

  if ($Action -eq 'status') {
    $available = @()
    $missing = @()
    foreach ($spec in Get-AppSpecs) {
      $registered = $false
      foreach ($progId in $spec.progIds) {
        try {
          if ($null -ne [Type]::GetTypeFromProgID($progId)) { $registered = $true; break }
        } catch { }
      }
      if ($registered) {
        $available += @{ id = $spec.id; name = $spec.name; vendor = $spec.vendor }
      } else {
        $missing += @{ id = $spec.id; name = $spec.name; vendor = $spec.vendor }
      }
    }
    Write-Result @{ ok = $true; platform = 'win32'; available = $available; missing = $missing }
    exit 0
  }

  Assert-File $Path
  $spec = Resolve-AppSpec $App $Vendor $Path
  if ($null -eq $spec) { throw "No application is available for $Path" }

  if ($Action -eq 'open') {
    $instance = New-AppInstance $spec (-not $Private)
    try {
      $document = Open-Document $instance $spec $Path $true
      Write-Result @{ ok = $true; app = $spec.id; name = $spec.name; document = [string]$document.Name; path = [IO.Path]::GetFullPath($Path) }
    } catch {
      Close-AppInstance $instance
      throw
    }
    exit 0
  }

  if ($Action -eq 'convert') {
    $conversion = Get-Conversion $Path
    if ($null -eq $conversion) { throw 'Only .doc, .xls and .ppt documents can be converted' }
    if (-not $Output) { throw 'An absolute output path is required' }
    if (-not [IO.Path]::IsPathRooted($Output)) { throw 'The output path must be absolute' }
    if ([IO.Path]::GetExtension($Output).ToLowerInvariant() -ne $conversion.targetExtension) {
      throw "The output path must end with $($conversion.targetExtension)"
    }
    if ((Test-Path -LiteralPath $Output) -and -not $Overwrite) {
      throw "Output already exists; set overwrite=true to replace it: $Output"
    }
    $instance = New-AppInstance $spec (-not $Private)
    try {
      Write-OwnerRecord $instance $spec
      if ($null -ne (Find-OpenDocument $instance $spec $Path)) {
        throw "Close the source document in $($spec.name) before converting: $Path"
      }
      $restore = Set-BackgroundMode $spec $instance.app
      try {
        $document = Open-Document $instance $spec $Path $false
        try { Save-ConvertedDocument $spec $document $Output ([int]$conversion.fileFormat) }
        finally { try { $document.Close($false) } catch { } }
      } finally {
        Restore-BackgroundMode $instance.app $restore
      }
      Write-Result @{ ok = $true; app = $spec.id; name = $spec.name; source = [IO.Path]::GetFullPath($Path); output = [IO.Path]::GetFullPath($Output); format = $conversion.targetExtension; private = [bool]$Private }
    } finally {
      Close-AppInstance $instance
    }
    exit 0
  }

  if ($Action -eq 'export-pdf') {
    if (-not $Output) { throw 'An absolute PDF output path is required' }
    if (-not [IO.Path]::IsPathRooted($Output)) { throw 'The PDF output path must be absolute' }
    $instance = New-AppInstance $spec (-not $Private)
    try {
      Write-OwnerRecord $instance $spec
      $restore = Set-BackgroundMode $spec $instance.app
      try {
        $document = Open-Document $instance $spec $Path $false
        Export-DocumentAsPdf $spec $document $Output
        # Do not close a document that belonged to an already-running user session.
        if ($instance.created) { try { $document.Close($false) } catch { } }
      } finally {
        Restore-BackgroundMode $instance.app $restore
      }
      Write-Result @{ ok = $true; app = $spec.id; name = $spec.name; output = [IO.Path]::GetFullPath($Output); private = [bool]$Private }
    } finally {
      Close-AppInstance $instance
    }
    exit 0
  }

  # save/close always operate on the document the user already has open.
  $instance = New-AppInstance $spec $true
  try {
    $document = Find-OpenDocument $instance $spec $Path
    if ($null -eq $document) { throw "The document is not open in $($spec.name): $Path" }
    if ($Action -eq 'save') {
      $document.Save()
      Write-Result @{ ok = $true; app = $spec.id; name = $spec.name; saved = [IO.Path]::GetFullPath($Path) }
    } elseif ($Action -eq 'close') {
      $document.Close([bool]$Save)
      Write-Result @{ ok = $true; app = $spec.id; name = $spec.name; closed = [IO.Path]::GetFullPath($Path); saved = [bool]$Save }
    }
  } finally {
    Close-AppInstance $instance
  }
} catch {
  Write-Result @{ ok = $false; error = $_.Exception.Message }
  exit 1
}
