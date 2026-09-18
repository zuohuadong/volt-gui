@echo off
setlocal
if "%~1"=="--" shift
if "%~1"=="" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\test-clean-windows-sandbox.ps1"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\test-clean-windows-sandbox.ps1" -ArtifactPath "%~1"
)
exit /b %ERRORLEVEL%
