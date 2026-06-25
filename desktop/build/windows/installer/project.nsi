Unicode true

####
## VoltUI per-user NSIS installer.
##
## This file is COMMITTED and customized (Wails leaves an existing project.nsi
## untouched and only regenerates wails_tools.nsh). The customizations vs.
## Wails' default template:
##
##   1. REQUEST_EXECUTION_LEVEL "user" + InstallDir under $LOCALAPPDATA - install
##      without administrator rights. This is what lets the auto-updater re-run a
##      freshly downloaded installer silently (`/S`) with no UAC prompt.
##   2. Uninstall registry under HKCU (not HKLM). Wails' wails.writeUninstaller /
##      wails.deleteUninstaller macros hard-code HKLM, which a non-admin install
##      cannot write - so we inline HKCU versions below instead.
##   3. InstallDir is remembered across updates via InstallDirRegKey +
##      InstallLocation (HKCU\...\Uninstall\InstallLocation). Without this, every
##      release forces the user back to %LOCALAPPDATA%\Programs\VoltUI even if
##      they had moved the install to a different drive (e.g. D:\Tools\VoltUI);
##      the silent auto-updater would re-run with /S into the wrong dir, leaving
##      the old install orphaned.
##   4. Running app processes are closed before install/uninstall so an overwrite
##      install can replace the old executable instead of failing on a locked file.
##
## Everything else mirrors Wails' generated default. Defines below override the
## ProjectInfo values that wails_tools.nsh would otherwise populate.
####

## Install per-user (no admin). Must be defined BEFORE including wails_tools.nsh,
## which only sets the "admin" default when REQUEST_EXECUTION_LEVEL is undefined.
!define REQUEST_EXECUTION_LEVEL "user"

####
## Include the wails tools (auto-generated; provides INFO_* defines and the
## wails.* macros used below).
####
!include "wails_tools.nsh"

# The version information for this two must consist of 4 parts
VIProductVersion "${INFO_PRODUCTVERSION}.0"
VIFileVersion    "${INFO_PRODUCTVERSION}.0"

VIAddVersionKey "CompanyName"     "${INFO_COMPANYNAME}"
VIAddVersionKey "FileDescription" "${INFO_PRODUCTNAME} Installer"
VIAddVersionKey "ProductVersion"  "${INFO_PRODUCTVERSION}"
VIAddVersionKey "FileVersion"     "${INFO_PRODUCTVERSION}"
VIAddVersionKey "LegalCopyright"  "${INFO_COPYRIGHT}"
VIAddVersionKey "ProductName"     "${INFO_PRODUCTNAME}"

# Enable HiDPI support. https://nsis.sourceforge.io/Reference/ManifestDPIAware
ManifestDPIAware true

!include "MUI.nsh"

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
# !define MUI_WELCOMEFINISHPAGE_BITMAP "resources\leftimage.bmp" #Include this to add a bitmap on the left side of the Welcome Page. Must be a size of 164x314
!define MUI_FINISHPAGE_NOAUTOCLOSE # Wait on the INSTFILES page so the user can take a look into the details of the installation steps
!define MUI_ABORTWARNING # This will warn the user if they exit from the installer.

!insertmacro MUI_PAGE_WELCOME # Welcome to the installer page.
# !insertmacro MUI_PAGE_LICENSE "resources\eula.txt" # Adds a EULA page to the installer
!insertmacro MUI_PAGE_DIRECTORY # In which folder install page.
!insertmacro MUI_PAGE_INSTFILES # Installing page.
!insertmacro MUI_PAGE_FINISH # Finished installation page.

!insertmacro MUI_UNPAGE_INSTFILES # Uinstalling page

!insertmacro MUI_LANGUAGE "English" # Set the Language of the installer

## The following two statements can be used to sign the installer and the uninstaller. The path to the binaries are provided in %1
#!uninstfinalize 'signtool --file "%1"'
#!finalize 'signtool --file "%1"'

Name "${INFO_PRODUCTNAME}"
OutFile "../../bin/voltui-desktop-${ARCH}-installer.exe" # Keep Linux makensis output path ASCII/POSIX-safe.
!define VOLTUI_DEFAULT_INSTALLDIR "$LOCALAPPDATA\Programs\${INFO_PRODUCTNAME}"
InstallDirRegKey HKCU "${UNINST_KEY}" "InstallLocation" # Reuse the previous install path on update; .onInit falls back to the default on first install.
InstallDir "${VOLTUI_DEFAULT_INSTALLDIR}" # Per-user install location (no admin rights required).
ShowInstDetails show # This will always show the installation details.

####
## Per-user uninstaller registry (HKCU). Replaces wails.writeUninstaller /
## wails.deleteUninstaller, which write HKLM and would fail without admin rights.
####
!macro voltui.writeUninstaller
    WriteUninstaller "$INSTDIR\uninstall.exe"

    WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${INFO_COMPANYNAME}"
    WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${INFO_PRODUCTNAME}"
    WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${INFO_PRODUCTVERSION}"
    WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\${PRODUCT_EXECUTABLE}"
    WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
    WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" "$\"$INSTDIR\uninstall.exe$\" /S"
    # Persist the resolved install path so a subsequent update picks it up
    # via InstallDirRegKey above. Without this, every release would force the
    # user back to %LOCALAPPDATA%\Programs\VoltUI even if they had moved
    # the install to a different drive (e.g. D:\Tools\VoltUI). The auto-
    # updater re-runs this installer with /S and trusts the persisted path,
    # so it has to be present before the silent re-install.
    WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"

    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" "$0"
!macroend

!macro voltui.deleteUninstaller
    Delete "$INSTDIR\uninstall.exe"
    DeleteRegKey HKCU "${UNINST_KEY}"
!macroend

!macro voltui.closeRunningApp
    DetailPrint "Closing running ${INFO_PRODUCTNAME} instances..."
    ; First request a normal close. This gives the Wails process a chance to run
    ; its shutdown path before the installer has to replace locked files.
    nsExec::ExecToLog 'taskkill /IM "${PRODUCT_EXECUTABLE}" /T'
    Pop $0
    StrCmp $0 "0" 0 +4
    Sleep 5000
    ; If an older version is still holding the executable, force it down so
    ; manual overwrite installs do not fail with "file in use".
    nsExec::ExecToLog 'taskkill /F /IM "${PRODUCT_EXECUTABLE}" /T'
    Pop $0
!macroend

Function .onInit
   !insertmacro wails.checkArchitecture

   ; InstallDirRegKey leaves $INSTDIR empty when the InstallLocation value
   ; is missing (first install, or the user wiped the uninstaller registry).
   ; Fall back to the per-user default so the directory page lands on a
   ; usable path instead of crashing the install with "InstallDir empty".
   StrCmp $INSTDIR "" 0 +2
   StrCpy $INSTDIR "${VOLTUI_DEFAULT_INSTALLDIR}"
FunctionEnd

Section
    !insertmacro wails.setShellContext
    !insertmacro voltui.closeRunningApp

    !insertmacro wails.webview2runtime

    SetOutPath $INSTDIR

    !insertmacro wails.files

    CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}" "" "$INSTDIR\${PRODUCT_EXECUTABLE}" 0
    CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}" "" "$INSTDIR\${PRODUCT_EXECUTABLE}" 0

    !insertmacro wails.associateFiles
    !insertmacro wails.associateCustomProtocols

    !insertmacro voltui.writeUninstaller
SectionEnd

Section "uninstall"
    !insertmacro wails.setShellContext
    !insertmacro voltui.closeRunningApp

    RMDir /r "$AppData\${PRODUCT_EXECUTABLE}" # Remove the WebView2 DataPath

    ; Precision uninstall: delete main application files
    Delete "$INSTDIR\${PRODUCT_EXECUTABLE}"

    Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"

    !insertmacro wails.unassociateFiles
    !insertmacro wails.unassociateCustomProtocols

    !insertmacro voltui.deleteUninstaller

    ; Only remove the installation directory if it is empty to prevent data loss
    RMDir $INSTDIR
SectionEnd
