package builtin

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	bundledCoreutilsDir      = "coreutils"
	bundledCoreutilsPathFile = "voltui-coreutils-path.txt"
)

// bundledCoreutilsBin resolves the command directory staged beside the Windows
// desktop executable. It is intentionally used only for VoltUI child processes:
// installing or updating VoltUI must never mutate the user's persistent PATH.
func bundledCoreutilsBin() string {
	if runtime.GOOS != "windows" {
		return ""
	}
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	return bundledCoreutilsBinAt(filepath.Dir(exe))
}

func bundledCoreutilsBinAt(appDir string) string {
	root := filepath.Join(appDir, bundledCoreutilsDir)
	data, err := os.ReadFile(filepath.Join(root, bundledCoreutilsPathFile))
	if err != nil {
		return ""
	}
	rel, ok := safeCoreutilsRuntimePath(string(data))
	if !ok {
		return ""
	}
	bin := filepath.Join(root, rel)
	info, err := os.Stat(bin)
	if err != nil || !info.IsDir() {
		return ""
	}
	for _, name := range []string{"coreutils.exe", "ls.exe", "grep.exe", "find.exe"} {
		info, err := os.Stat(filepath.Join(bin, name))
		if err == nil && !info.IsDir() {
			return bin
		}
	}
	return ""
}

func safeCoreutilsRuntimePath(value string) (string, bool) {
	value = strings.TrimSpace(value)
	if value == "." {
		return ".", true
	}
	if value == "" || strings.ContainsRune(value, 0) || strings.HasPrefix(value, "/") || strings.HasPrefix(value, "\\") {
		return "", false
	}
	// filepath.VolumeName is host-dependent, so reject a Windows drive even
	// while the validation test is running on another platform.
	if len(value) >= 3 && ((value[0] >= 'A' && value[0] <= 'Z') || (value[0] >= 'a' && value[0] <= 'z')) && value[1] == ':' && (value[2] == '/' || value[2] == '\\') {
		return "", false
	}
	rel := filepath.Clean(filepath.FromSlash(value))
	if filepath.IsAbs(rel) || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", false
	}
	for _, part := range strings.FieldsFunc(value, func(r rune) bool { return r == '/' || r == '\\' }) {
		if part == "." || part == ".." {
			return "", false
		}
	}
	return rel, true
}
