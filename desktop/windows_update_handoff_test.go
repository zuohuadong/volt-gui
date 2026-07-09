package main

import (
	"os"
	"strings"
	"testing"
)

func TestInstallerCommandLineIsSilentAndKeepsDFlagLast(t *testing.T) {
	got := installerCommandLine(`C:\Temp\VoltUI Installer.exe`, `D:\Tools\VoltUI App`)
	want := `"C:\Temp\VoltUI Installer.exe" /S /D=D:\Tools\VoltUI App`
	if got != want {
		t.Fatalf("installerCommandLine = %q, want %q", got, want)
	}
	if !strings.HasSuffix(got, `/D=D:\Tools\VoltUI App`) {
		t.Fatalf("/D= must be the final unquoted NSIS token, got %q", got)
	}
}

func TestWindowsUpdateHandoffArgsCarryParentInstallAndRelaunch(t *testing.T) {
	got := windowsUpdateHandoffArgs(
		4242,
		`C:\Users\Jane Doe\AppData\Local\VoltUI\updates\VoltUI-windows-amd64-installer.exe`,
		`D:\Tools\VoltUI App`,
		`D:\Tools\VoltUI App\voltui-desktop.exe`,
	)
	want := []string{
		"--parent-pid", "4242",
		"--installer", `C:\Users\Jane Doe\AppData\Local\VoltUI\updates\VoltUI-windows-amd64-installer.exe`,
		"--install-dir", `D:\Tools\VoltUI App`,
		"--relaunch", `D:\Tools\VoltUI App\voltui-desktop.exe`,
	}
	if strings.Join(got, "\x00") != strings.Join(want, "\x00") {
		t.Fatalf("args = %#v, want %#v", got, want)
	}
}

func TestWindowsInstallerScriptWaitsBeforeCopyingExecutable(t *testing.T) {
	data, err := os.ReadFile("build/windows/installer/project.nsi")
	if err != nil {
		t.Fatal(err)
	}
	script := string(data)
	for _, want := range []string{
		`!define VOLTUI_UPDATE_HELPER "voltui-update-helper.exe"`,
		"Function voltui.waitForExecutableUnlock",
		`FileOpen $1 "$INSTDIR\${PRODUCT_EXECUTABLE}" a`,
		`OutFile "..\..\bin\voltui-desktop-${ARCH}-installer.exe"`,
		"SetErrorLevel 1618",
		"Call voltui.waitForExecutableUnlock",
		`File "/oname=${VOLTUI_UPDATE_HELPER}" "${VOLTUI_UPDATE_HELPER}"`,
		`Delete "$INSTDIR\${VOLTUI_UPDATE_HELPER}"`,
	} {
		if !strings.Contains(script, want) {
			t.Fatalf("project.nsi missing %q", want)
		}
	}
	wait := strings.Index(script, "Call voltui.waitForExecutableUnlock")
	copyFiles := strings.Index(script, "!insertmacro wails.files")
	if wait < 0 || copyFiles < 0 || wait > copyFiles {
		t.Fatalf("installer must wait for the running exe to unlock before wails.files (wait=%d copy=%d)", wait, copyFiles)
	}
}

func TestDesktopBuildScriptCompilesAndPackagesWindowsUpdateHelper(t *testing.T) {
	data, err := os.ReadFile("../scripts/desktop-build.sh")
	if err != nil {
		t.Fatal(err)
	}
	script := string(data)
	for _, want := range []string{
		`BINNAME="voltui-desktop"`,
		`cp -R "build/bin/${BINNAME}.app" "$app"`,
		`UPDATE_HELPER="voltui-update-helper.exe"`,
		`GOOS=windows GOARCH="$arch" go build`,
		`./cmd/update-helper`,
		`build/windows/installer/$UPDATE_HELPER`,
		`cp "$helper" "$staging/$UPDATE_HELPER"`,
		`command -v cygpath`,
		`zip -q -r "$ROOT/dist/${APPNAME}-windows-${arch}.zip" .`,
	} {
		if !strings.Contains(script, want) {
			t.Fatalf("desktop-build.sh missing %q", want)
		}
	}
}
