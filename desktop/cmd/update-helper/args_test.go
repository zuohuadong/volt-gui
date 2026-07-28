package main

import (
	"strings"
	"testing"
)

func TestInstallerCommandLineUsesVisibleUpdateModeAndLeavesDFlagLast(t *testing.T) {
	got := installerCommandLine(`C:\Temp\VoltUI Installer.exe`, `D:\Tools\VoltUI App`)
	want := `"C:\Temp\VoltUI Installer.exe" /REASONIXUPDATE=1 /D=D:\Tools\VoltUI App`
	if got != want {
		t.Fatalf("installerCommandLine = %q, want %q", got, want)
	}
	if strings.Contains(got, " /S") {
		t.Fatalf("auto-update must expose progress instead of using silent mode, got %q", got)
	}
	if !strings.HasSuffix(got, `/D=D:\Tools\VoltUI App`) {
		t.Fatalf("/D= must be the final unquoted NSIS token, got %q", got)
	}
}
