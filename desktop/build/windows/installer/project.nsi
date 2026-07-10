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
##      InstallLocation (HKCU\...\Uninstall\InstallLocation). When upgrading from
##      a build that did not write InstallLocation yet, .onInit falls back to the
##      old DisplayIcon path before using the default. Without this, every release
##      forces the user back to %LOCALAPPDATA%\Programs\VoltUI even if they had
##      moved the install to a different drive (e.g. D:\Tools\VoltUI); the silent
##      auto-updater would re-run with /S into the wrong dir, leaving the old
##      install orphaned.
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
!include "FileFunc.nsh"
!include "LogicLib.nsh"

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
OutFile "..\..\bin\${INFO_PROJECTNAME}-${ARCH}-installer.exe" # Name of the installer's file.
!define VOLTUI_DEFAULT_INSTALLDIR "$LOCALAPPDATA\Programs\${INFO_PRODUCTNAME}"
!define VOLTUI_UPDATE_HELPER "voltui-update-helper.exe"
!define VOLTUI_COMPUTER_USE_MCP_DIR "computer-use-mcp"
!define VOLTUI_COMPUTER_USE_RUNTIME_DIR "computer-use-runtime"
!define VOLTUI_COREUTILS_DIR "coreutils"
!define VOLTUI_COREUTILS_SYSTEM_INSTALLER "coreutils-system-installer.exe"
!define VOLTUI_COREUTILS_INSTALL_SHORTCUT "Install Microsoft Coreutils (Administrator).lnk"
!define VOLTUI_UNLOCK_RETRIES 60
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

Function .onInit
   !insertmacro wails.checkArchitecture

   ; InstallDirRegKey leaves $INSTDIR empty when the InstallLocation value is
   ; missing. Older installers still wrote DisplayIcon, so use its parent folder
   ; as a compatibility bridge before falling back to the per-user default.
   StrCmp $INSTDIR "" 0 done
   ClearErrors
   ReadRegStr $0 HKCU "${UNINST_KEY}" "DisplayIcon"
   IfErrors fallback
   StrCmp $0 "" fallback
   ${GetParent} "$0" $INSTDIR
   StrCmp $INSTDIR "" fallback done

fallback:
   StrCpy $INSTDIR "${VOLTUI_DEFAULT_INSTALLDIR}"
done:
FunctionEnd

Function voltui.waitForExecutableUnlock
   IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" 0 done
   StrCpy $0 0

retry:
   ClearErrors
   FileOpen $1 "$INSTDIR\${PRODUCT_EXECUTABLE}" a
   IfErrors locked
   FileClose $1
   Goto done

locked:
   IntOp $0 $0 + 1
   IntCmp $0 ${VOLTUI_UNLOCK_RETRIES} failed 0 0
   Sleep 1000
   Goto retry

failed:
   IfSilent silent interactive

interactive:
   MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "${INFO_PRODUCTNAME} is still running. Close ${INFO_PRODUCTNAME}, then click Retry to continue the installation." IDRETRY retry IDCANCEL abort
   Goto retry

silent:
   SetErrorLevel 1618

abort:
   Abort "${INFO_PRODUCTNAME} is still running. Close ${INFO_PRODUCTNAME} and run the installer again."

done:
FunctionEnd

Section
    !insertmacro wails.setShellContext

    !insertmacro wails.webview2runtime

    Call voltui.waitForExecutableUnlock

    SetOutPath $INSTDIR

    !insertmacro wails.files
    !if /FileExists "${VOLTUI_UPDATE_HELPER}"
    File "/oname=${VOLTUI_UPDATE_HELPER}" "${VOLTUI_UPDATE_HELPER}"
    !else
    !warning "${VOLTUI_UPDATE_HELPER} was not found; Windows auto-update will fall back to installer-side waiting only."
    !endif
    !if /FileExists "${VOLTUI_COMPUTER_USE_MCP_DIR}\node_modules\@zavora-ai\computer-use-mcp\dist\server.js"
    SetOutPath "$INSTDIR\${VOLTUI_COMPUTER_USE_MCP_DIR}"
    File /r "${VOLTUI_COMPUTER_USE_MCP_DIR}\*"
    SetOutPath $INSTDIR
    !else
    !warning "${VOLTUI_COMPUTER_USE_MCP_DIR} was not found; bundled computer-use MCP will be unavailable."
    !endif
    !if /FileExists "${VOLTUI_COMPUTER_USE_RUNTIME_DIR}\bun-windows-amd64\bin\bun.exe"
    SetOutPath "$INSTDIR\${VOLTUI_COMPUTER_USE_RUNTIME_DIR}"
    File /r "${VOLTUI_COMPUTER_USE_RUNTIME_DIR}\*"
    SetOutPath $INSTDIR
    !else
    !warning "${VOLTUI_COMPUTER_USE_RUNTIME_DIR} was not found; bundled computer-use Bun runtime will be unavailable."
    !endif
    ; Coreutils is a required offline payload. It stays private to VoltUI unless
    ; an administrator explicitly runs the bundled upstream installer; do not
    ; silently alter PATH or trigger UAC during routine VoltUI updates.
    !if /FileExists "${VOLTUI_COREUTILS_DIR}\voltui-coreutils-path.txt"
    !if /FileExists "${VOLTUI_COREUTILS_DIR}\${VOLTUI_COREUTILS_SYSTEM_INSTALLER}"
    RMDir /r "$INSTDIR\${VOLTUI_COREUTILS_DIR}"
    SetOutPath "$INSTDIR\${VOLTUI_COREUTILS_DIR}"
    File /r "${VOLTUI_COREUTILS_DIR}\*"
    SetOutPath $INSTDIR
    !else
    !error "Required Coreutils system installer is missing from the Windows build resources."
    !endif
    !else
    !error "Required Coreutils runtime is missing from the Windows build resources."
    !endif

    CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
    CreateShortcut "$SMPROGRAMS\${VOLTUI_COREUTILS_INSTALL_SHORTCUT}" "$INSTDIR\${VOLTUI_COREUTILS_DIR}\${VOLTUI_COREUTILS_SYSTEM_INSTALLER}"
    CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"

    !insertmacro wails.associateFiles
    !insertmacro wails.associateCustomProtocols

    !insertmacro voltui.writeUninstaller
SectionEnd

Section "uninstall"
    !insertmacro wails.setShellContext

    RMDir /r "$AppData\${PRODUCT_EXECUTABLE}" # Remove the WebView2 DataPath

    ; Precision uninstall: delete main application files
    Delete "$INSTDIR\${PRODUCT_EXECUTABLE}"
    Delete "$INSTDIR\${VOLTUI_UPDATE_HELPER}"
    RMDir /r "$INSTDIR\${VOLTUI_COMPUTER_USE_MCP_DIR}"
    RMDir /r "$INSTDIR\${VOLTUI_COMPUTER_USE_RUNTIME_DIR}"
    ; This only removes VoltUI's private copy. A separately administrator-
    ; installed Microsoft Coreutils instance is intentionally left untouched.
    RMDir /r "$INSTDIR\${VOLTUI_COREUTILS_DIR}"

    Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
    Delete "$SMPROGRAMS\${VOLTUI_COREUTILS_INSTALL_SHORTCUT}"
    Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"

    !insertmacro wails.unassociateFiles
    !insertmacro wails.unassociateCustomProtocols

    !insertmacro voltui.deleteUninstaller

    ; Only remove the installation directory if it is empty to prevent data loss
    RMDir $INSTDIR
SectionEnd
