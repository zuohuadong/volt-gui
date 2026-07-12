package config

import (
	"os"
	"path/filepath"
	"testing"

	fileencoding "voltui/internal/fileutil/encoding"
)

func TestLoadDotEnvDoesNotImportProjectOrHomeEnv(t *testing.T) {
	cwd := t.TempDir()
	home := t.TempDir()

	if err := os.WriteFile(filepath.Join(cwd, ".env"), []byte("KEY_CWD=from_cwd\nKEY_SHARED=cwd_wins\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, ".env"), []byte("KEY_HOME=from_home\nKEY_SHARED=home_loses\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Chdir(cwd)
	t.Setenv("HOME", home)
	t.Setenv("VOLTUI_CREDENTIALS_STORE", "file")
	t.Setenv("USERPROFILE", home) // os.UserHomeDir reads HOME on Unix and USERPROFILE on Windows.

	// Start clean so the file values are what land (Setenv auto-restores).
	t.Setenv("KEY_CWD", "")
	os.Unsetenv("KEY_CWD")
	t.Setenv("KEY_HOME", "")
	os.Unsetenv("KEY_HOME")
	t.Setenv("KEY_SHARED", "")
	os.Unsetenv("KEY_SHARED")

	loadDotEnv()

	if got := os.Getenv("KEY_CWD"); got != "" {
		t.Errorf("project .env key was imported into process env: KEY_CWD=%q", got)
	}
	if got := os.Getenv("KEY_HOME"); got != "" {
		t.Errorf("home .env key was loaded: KEY_HOME=%q", got)
	}
	if got := os.Getenv("KEY_SHARED"); got != "" {
		t.Errorf("project/home .env shared key was imported: KEY_SHARED=%q", got)
	}
}

// TestLoadDotEnvReadsGlobalCredentials proves `voltui setup`'s target — the
// voltui-owned credentials file in the user config dir — is loaded from any
// working directory and wins over a project ./.env on a shared key.
func TestLoadDotEnvReadsGlobalCredentials(t *testing.T) {
	cwd := t.TempDir()
	cfgHome := t.TempDir()

	t.Chdir(cwd)
	t.Setenv("HOME", cfgHome)
	t.Setenv("VOLTUI_CREDENTIALS_STORE", "file")
	t.Setenv("USERPROFILE", cfgHome)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(cfgHome, ".config"))
	t.Setenv("AppData", filepath.Join(cfgHome, "AppData"))

	cred := UserCredentialsPath()
	if cred == "" {
		t.Skip("user config dir unresolved on this platform")
	}
	if err := os.MkdirAll(filepath.Dir(cred), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cred, []byte("KEY_GLOBAL=from_credentials\nKEY_SHARED=global_wins\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(cwd, ".env"), []byte("KEY_SHARED=cwd_wins\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Setenv("KEY_GLOBAL", "")
	os.Unsetenv("KEY_GLOBAL")
	t.Setenv("KEY_SHARED", "")
	os.Unsetenv("KEY_SHARED")

	loadDotEnv()

	if got := os.Getenv("KEY_GLOBAL"); got != "from_credentials" {
		t.Errorf("global credentials not loaded: KEY_GLOBAL=%q want from_credentials", got)
	}
	if got := os.Getenv("KEY_SHARED"); got != "global_wins" {
		t.Errorf("global credentials should win over project .env: KEY_SHARED=%q want global_wins", got)
	}
}

func TestLoadDotEnvDecodesGB18030Credentials(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("VOLTUI_CREDENTIALS_STORE", "file")
	t.Setenv("PINNED_CN", "")
	os.Unsetenv("PINNED_CN")

	cred := UserCredentialsPath()
	if err := os.MkdirAll(filepath.Dir(cred), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cred, fileencoding.Encode("PINNED_CN=中文\n", fileencoding.GB18030), 0o600); err != nil {
		t.Fatal(err)
	}

	loadDotEnv()
	if got := os.Getenv("PINNED_CN"); got != "中文" {
		t.Fatalf("PINNED_CN = %q, want decoded Chinese value", got)
	}
}

// TestLoadDotEnvDoesNotOverrideEnv confirms an already-set environment variable
// beats both .env files (the documented first-wins contract).
func TestLoadDotEnvDoesNotOverrideEnv(t *testing.T) {
	cwd := t.TempDir()
	if err := os.WriteFile(filepath.Join(cwd, ".env"), []byte("PINNED=from_file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Chdir(cwd)
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("PINNED", "from_env")

	loadDotEnv()

	if got := os.Getenv("PINNED"); got != "from_env" {
		t.Errorf("env var must win over .env: PINNED=%q want from_env", got)
	}
}
