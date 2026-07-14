package repair

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestPendingUpdateRejectsTargetOutsideGuardInstall(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REASONIX_HOME", home)
	guardDir := t.TempDir()
	target := filepath.Join(t.TempDir(), "reasonix-desktop")
	backup := filepath.Join(home, "repair", "updates", "reasonix-desktop.previous")
	if err := os.MkdirAll(filepath.Dir(backup), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(backup, []byte("old"), 0o700); err != nil {
		t.Fatal(err)
	}
	tx := &UpdateTransaction{SchemaVersion: 1, ToVersion: "v2", TargetKind: "file", TargetPath: target, BackupPath: backup, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)}
	if err := WritePendingUpdate(tx); err != nil {
		t.Fatal(err)
	}
	originalExecutable := repairExecutable
	repairExecutable = func() (string, error) { return filepath.Join(guardDir, "reasonix-guard"), nil }
	t.Cleanup(func() { repairExecutable = originalExecutable })
	if _, err := ReadPendingUpdate(); err == nil {
		t.Fatal("pending update outside Guard install was accepted")
	}
}

func TestPendingUpdateRejectsUnexpectedReleaseFile(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REASONIX_HOME", home)
	dir := t.TempDir()
	target := filepath.Join(dir, "reasonix-desktop")
	backup := filepath.Join(home, "repair", "updates", "reasonix-desktop.previous")
	if err := os.MkdirAll(filepath.Dir(backup), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(backup, []byte("old"), 0o700); err != nil {
		t.Fatal(err)
	}
	originalExecutable := repairExecutable
	repairExecutable = func() (string, error) { return filepath.Join(dir, "reasonix-guard"), nil }
	t.Cleanup(func() { repairExecutable = originalExecutable })
	bad := []UpdateTransactionFile{
		{TargetPath: filepath.Join(dir, "evil.exe"), BackupPath: backup},
		{TargetPath: filepath.Join(t.TempDir(), "reasonix-guard"), BackupPath: backup},
		{TargetPath: filepath.Join(dir, "reasonix-guard"), BackupPath: filepath.Join(t.TempDir(), "loose.previous")},
	}
	for _, file := range bad {
		tx := &UpdateTransaction{
			SchemaVersion: 1,
			ToVersion:     "v2",
			TargetKind:    "file",
			TargetPath:    target,
			BackupPath:    backup,
			Files:         []UpdateTransactionFile{{TargetPath: target, BackupPath: backup}, file},
			CreatedAt:     time.Now().UTC().Format(time.RFC3339Nano),
		}
		if err := WritePendingUpdate(tx); err != nil {
			t.Fatal(err)
		}
		if _, err := ReadPendingUpdate(); err == nil {
			t.Fatalf("release file entry %+v was accepted", file)
		}
	}
}
