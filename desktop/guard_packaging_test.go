package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func writePortableFixture(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o755); err != nil {
		t.Fatal(err)
	}
}

func TestVerifyWindowsPortableRejectsCaseCollisionsAndCLIOverwrite(t *testing.T) {
	t.Setenv("WINDOWS_PORTABLE_APP_NAME", "VoltUI")
	t.Setenv("WINDOWS_PORTABLE_BINARY_PREFIX", "voltui")
	verify := filepath.Join("..", "scripts", "verify-windows-portable.sh")
	good := t.TempDir()
	for _, name := range []string{
		"voltui-guard.exe",
		"voltui-update-helper.exe",
	} {
		writePortableFixture(t, good, name, name)
	}
	writePortableFixture(t, good, "VoltUI.exe", "desktop")
	writePortableFixture(t, good, "voltui-desktop.exe", "desktop")
	writePortableFixture(t, good, "voltui-launcher.exe", "launcher")
	writePortableFixture(t, good, "voltui-cli.exe", "cli")
	if out, err := exec.Command("bash", verify, good).CombinedOutput(); err != nil {
		t.Fatalf("valid portable fixture failed: %v\n%s", err, out)
	}

	overwritten := t.TempDir()
	for _, name := range []string{
		"voltui-guard.exe",
		"voltui-update-helper.exe",
	} {
		writePortableFixture(t, overwritten, name, name)
	}
	writePortableFixture(t, overwritten, "VoltUI.exe", "cli")
	writePortableFixture(t, overwritten, "voltui-desktop.exe", "desktop")
	writePortableFixture(t, overwritten, "voltui-launcher.exe", "launcher")
	writePortableFixture(t, overwritten, "voltui-cli.exe", "cli")
	if out, err := exec.Command("bash", verify, overwritten).CombinedOutput(); err == nil || !strings.Contains(string(out), "was overwritten by the CLI sidecar") {
		t.Fatalf("overwritten launcher result = %v, output %q", err, out)
	}

	// A case-sensitive test filesystem can represent the exact source-level
	// mistake that NTFS collapses into one overwritten file. Either filesystem
	// behavior must be rejected by the verifier.
	collision := t.TempDir()
	writePortableFixture(t, collision, "VoltUI.exe", "desktop")
	writePortableFixture(t, collision, "voltui.exe", "cli")
	entries, err := os.ReadDir(collision)
	if err != nil {
		t.Fatal(err)
	}
	out, verifyErr := exec.Command("bash", verify, collision).CombinedOutput()
	if verifyErr == nil {
		t.Fatal("case-only portable entry names were accepted")
	}
	if len(entries) == 2 && !strings.Contains(string(out), "collide case-insensitively") {
		t.Fatalf("case-collision output = %q", out)
	}
}

func TestDesktopPackagesPreserveNativePlatformLaunchers(t *testing.T) {
	buildData, err := os.ReadFile("../scripts/desktop-build.sh")
	if err != nil {
		t.Fatal(err)
	}
	build := string(buildData)
	for _, want := range []string{
		`CLINAME="reasonix"`,
		`WINDOWS_CLINAME="voltui-cli"`,
		`./cmd/reasonix`,
		`cp "$guard_out" "$app/Contents/MacOS/$GUARDNAME"`,
		`cp "$cli_out" "$app/Contents/MacOS/$CLINAME"`,
		`[ "$bundle_executable" = "$BINNAME" ]`,
		`Print :CFBundleIconFile`,
		`Contents/Resources/$bundle_icon`,
		`-H windowsgui`,
		`stamp_windows_executable "$guard_out" "VoltUI Guard"`,
		`stamp_windows_executable "$launcher_out" "VoltUI Launcher"`,
		`stamp_windows_executable "build/windows/installer/$UPDATE_HELPER" "VoltUI Update Helper"`,
		`payload_dir="$ROOT/desktop/build/windows/signing-payload"`,
		`cp "build/bin/$BINNAME.exe" "$payload_dir/$BINNAME.exe"`,
		`cp "$launcher_out" "$payload_dir/$LAUNCHERNAME.exe"`,
		`cp "$guard_out" "$payload_dir/$GUARDNAME.exe"`,
		`cp "build/windows/installer/$WINDOWS_CLINAME.exe" "$payload_dir/$WINDOWS_CLINAME.exe"`,
		`cp "build/windows/installer/voltui-uninstall.exe" "$payload_dir/voltui-uninstall.exe"`,
		`"$ROOT/scripts/package-windows-desktop.sh" "$arch" "$payload_dir"`,
		`"$BINNAME" "$GUARDNAME" "$CLINAME"`,
	} {
		if !strings.Contains(build, want) {
			t.Errorf("desktop-build.sh missing guard launcher contract %q", want)
		}
	}
	if strings.Contains(build, `Set :CFBundleExecutable $GUARDNAME`) {
		t.Fatal("macOS package must not replace the native Wails bundle executable with Guard")
	}
	launcherStamp := strings.Index(build, `stamp_windows_executable "$launcher_out" "VoltUI Launcher"`)
	payloadCopy := strings.Index(build, `cp "$launcher_out" "$payload_dir/$LAUNCHERNAME.exe"`)
	if launcherStamp < 0 || payloadCopy < 0 || launcherStamp > payloadCopy {
		t.Fatalf("Windows payload must copy the already-stamped launcher (stamp=%d copy=%d)", launcherStamp, payloadCopy)
	}
	if strings.Contains(build, `"$staging/$CLINAME.exe"`) {
		t.Fatal("Windows package must not collide reasonix.exe with the Reasonix.exe launcher")
	}

	workflowData, err := os.ReadFile("../.github/workflows/release-desktop.yml")
	if err != nil {
		t.Fatal(err)
	}
	workflow := string(workflowData)
	for _, platform := range []string{"windows/amd64", "windows/arm64"} {
		if !strings.Contains(workflow, "platform: "+platform) {
			t.Errorf("desktop release matrix missing resource-stamped target %s", platform)
		}
	}

	linuxData, err := os.ReadFile("build/linux/voltui.desktop")
	if err != nil {
		t.Fatal(err)
	}
	linux := string(linuxData)
	for _, want := range []string{
		"Exec=voltui-desktop",
		"Icon=voltui-desktop",
		"StartupWMClass=voltui-desktop",
	} {
		if !strings.Contains(linux, want) {
			t.Errorf("Linux desktop entry missing identity contract %q", want)
		}
	}
	nfpmData, err := os.ReadFile("build/linux/nfpm.yaml")
	if err != nil {
		t.Fatal(err)
	}
	nfpm := string(nfpmData)
	for _, want := range []string{
		"/usr/bin/voltui-desktop",
		"/usr/lib/voltui/computer-use-mcp",
		"/usr/lib/voltui/computer-use-runtime",
		"/usr/share/applications/voltui.desktop",
		"/usr/share/pixmaps/voltui-desktop.png",
	} {
		if !strings.Contains(nfpm, want) {
			t.Errorf("Linux package missing desktop identity asset %q", want)
		}
	}
	for _, want := range []string{
		`stage-computer-use-mcp.mjs`,
		`stage-bun-runtime.mjs`,
		`deb_version=`,
		`dpkg-deb --contents`,
		`dpkg-deb --field`,
	} {
		if !strings.Contains(build, want) {
			t.Errorf("desktop-build.sh missing Linux deb helper contract %q", want)
		}
	}
	for _, unsafe := range []string{
		`dpkg-deb --field "$deb_path" Package | grep -qx`,
		`dpkg-deb --field "$deb_path" Version | grep -qx`,
		`dpkg-deb --field "$deb_path" Depends | grep -Fq`,
		`dpkg-deb --contents "$deb_path" | grep -Eq`,
	} {
		if strings.Contains(build, unsafe) {
			t.Errorf("desktop-build.sh uses early-exit grep under pipefail: %q", unsafe)
		}
	}

	windowsData, err := os.ReadFile("build/windows/installer/project.nsi")
	if err != nil {
		t.Fatal(err)
	}
	windows := string(windowsData)
	for _, want := range []string{
		`File "/oname=${REASONIX_CLI}" "${REASONIX_CLI}"`,
		`!uninstfinalize 'node "${__FILEDIR__}/../../../../scripts/copy-nsis-uninstaller.mjs" "%1" "${__FILEDIR__}/voltui-uninstall.exe"'`,
		`File "/oname=uninstall.exe" "${ARG_REASONIX_SIGNED_UNINSTALLER}"`,
		`CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"`,
		`CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"`,
	} {
		if !strings.Contains(windows, want) {
			t.Errorf("Windows installer missing guard shortcut contract %q", want)
		}
	}
}
