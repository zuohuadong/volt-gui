package main

import (
	"os"
	"path/filepath"
	"strings"

	"voltui/internal/config"
	"voltui/internal/fileutil"
)

// upsertDotEnv stores KEY=value in VoltUI's global .env and applies it to the
// running process so a rebuild picks it up without a restart.
func upsertDotEnv(key, value string) error {
	_, err := config.SetCredential(key, value)
	return err
}

func removeDotEnv(key string) error {
	return config.RemoveCredential(key)
}

// upsertEnvFile merges KEY=value into a KEY=value file at path, preserving
// comments and unrelated lines, writing atomically via a sibling temp + rename.
func upsertEnvFile(path, key, value string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return nil
	}
	var lines []string
	if b, err := os.ReadFile(path); err == nil {
		lines = strings.Split(strings.TrimRight(string(b), "\n"), "\n")
	}
	replaced := false
	for i, ln := range lines {
		t := strings.TrimSpace(ln)
		if t == "" || strings.HasPrefix(t, "#") {
			continue
		}
		if k, _, ok := strings.Cut(t, "="); ok && strings.TrimSpace(k) == key {
			lines[i] = key + "=" + value
			replaced = true
			break
		}
	}
	if !replaced {
		lines = append(lines, key+"="+value)
	}
	out := strings.Join(lines, "\n") + "\n"

	dir := filepath.Dir(path)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	tmp, err := os.CreateTemp(dir, "credentials.*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.WriteString(out); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	if err := fileutil.ReplaceFile(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return os.Setenv(key, value)
}

func removeEnvFile(path, key string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return os.Unsetenv(key)
		}
		return err
	}
	lines := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
	outLines := make([]string, 0, len(lines))
	for _, ln := range lines {
		t := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(ln), "export "))
		if t == "" || strings.HasPrefix(t, "#") {
			outLines = append(outLines, ln)
			continue
		}
		if k, _, ok := strings.Cut(t, "="); ok && strings.TrimSpace(k) == key {
			continue
		}
		outLines = append(outLines, ln)
	}
	out := ""
	if len(outLines) > 0 {
		out = strings.Join(outLines, "\n") + "\n"
	}

	dir := filepath.Dir(path)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	tmp, err := os.CreateTemp(dir, "credentials.*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.WriteString(out); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	if err := fileutil.ReplaceFile(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return os.Unsetenv(key)
}

func envFileKeys(path string) map[string]bool {
	keys := map[string]bool{}
	data, err := os.ReadFile(path)
	if err != nil {
		return keys
	}
	for _, raw := range strings.Split(string(data), "\n") {
		line := strings.TrimPrefix(strings.TrimSpace(raw), "export ")
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if k, _, ok := strings.Cut(line, "="); ok {
			keys[strings.TrimSpace(k)] = true
		}
	}
	return keys
}

// promoteProviderKeysToCredentials copies configured provider api_key_env values
// that currently resolve into VoltUI's global credentials store when they are
// not already there. Promoted keys are then stripped from ~/.env; project .env
// files remain user-owned and untouched.
func promoteProviderKeysToCredentials(cfg *config.Config) {
	if cfg == nil {
		return
	}
	credPath := config.UserCredentialsPath()
	have := envFileKeys(credPath)
	for _, p := range cfg.Providers {
		env := strings.TrimSpace(p.APIKeyEnv)
		if env == "" || have[env] {
			continue
		}
		val := os.Getenv(env)
		if val == "" {
			continue
		}
		if err := upsertEnvFile(credPath, env, val); err != nil {
			continue
		}
		have[env] = true
		removeHomeEnvKey(env)
	}
}

func removeHomeEnvKey(key string) {
	home, err := os.UserHomeDir()
	if err != nil {
		return
	}
	path := filepath.Join(home, ".env")
	if sameConfigPath(path, config.UserCredentialsPath()) {
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var kept []string
	removed := false
	for _, raw := range strings.Split(string(data), "\n") {
		check := strings.TrimPrefix(strings.TrimSpace(raw), "export ")
		if k, _, ok := strings.Cut(check, "="); ok && strings.TrimSpace(k) == key {
			removed = true
			continue
		}
		kept = append(kept, raw)
	}
	if !removed {
		return
	}
	_ = os.WriteFile(path, []byte(strings.Join(kept, "\n")), 0o600)
}
