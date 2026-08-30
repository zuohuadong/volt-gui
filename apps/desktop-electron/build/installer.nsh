!macro customCheckAppRunning
  System::Call 'kernel32::GetCurrentProcessId()i.r0'
  DetailPrint "正在关闭 ${PRODUCT_NAME} 及其后台服务..."

  StrCpy $R1 0
  voltui_close_retry:
    IntOp $R1 $R1 + 1
    nsExec::Exec `"$PowerShellPath" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$root = [IO.Path]::GetFullPath('$INSTDIR').TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar; $$targets = @(Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue | Where-Object { $$_.ProcessId -ne $0 -and $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$root, [StringComparison]::OrdinalIgnoreCase) }); $$targets | ForEach-Object { & '$SYSDIR\taskkill.exe' /PID $$_.ProcessId /T /F *> $$null }; Start-Sleep -Milliseconds 500; if (@(Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue | Where-Object { $$_.ProcessId -ne $0 -and $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$root, [StringComparison]::OrdinalIgnoreCase) }).Count -gt 0) { exit 1 }"`
    Pop $R0
    StrCmp $R0 "0" voltui_close_done

    ; PowerShell 被系统策略禁用时，仍可按产品进程名终止完整子进程树。
    nsExec::Exec `"$CmdPath" /C taskkill /IM "${APP_EXECUTABLE_FILENAME}" /T /F /FI "PID ne $0"`
    Pop $R0
    Sleep 500
    nsExec::Exec `"$CmdPath" /C tasklist /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
    Pop $R0
    StrCmp $R0 "0" 0 voltui_close_done
    ${if} $R1 >= 3
      Goto voltui_close_failed
    ${endif}
    Goto voltui_close_retry

  voltui_close_failed:
    DetailPrint "无法关闭 ${PRODUCT_NAME}。请结束其进程后重新运行安装程序。"
    Quit

  voltui_close_done:
!macroend
