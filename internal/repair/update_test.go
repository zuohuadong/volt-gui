package repair

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFileUpdateRollbackRestoresPreviousBinary(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REASONIX_HOME", home)
	target := filepath.Join(t.TempDir(), "reasonix-desktop")
	originalExecutable := repairExecutable
	repairExecutable = func() (string, error) { return filepath.Join(filepath.Dir(target), "reasonix-guard"), nil }
	t.Cleanup(func() { repairExecutable = originalExecutable })
	if err := os.WriteFile(target, []byte("old"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := PrepareFileUpdate("v1", "v2", target); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("new"), 0o700); err != nil {
		t.Fatal(err)
	}
	result, err := RollbackPendingUpdate()
	if err != nil {
		t.Fatal(err)
	}
	if !result.RolledBack || result.ToVersion != "v1" {
		t.Fatalf("rollback result = %+v", result)
	}
	got, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "old" {
		t.Fatalf("restored binary = %q", got)
	}
}

func TestFileUpdateRollbackRestoresReleaseUnit(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REASONIX_HOME", home)
	// Resolve symlinks up front (macOS /var -> /private/var) so the recorded
	// target dir matches the resolved launcher dir in validation.
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(dir, "reasonix-desktop")
	guard := filepath.Join(dir, "reasonix-guard")
	originalExecutable := repairExecutable
	repairExecutable = func() (string, error) { return guard, nil }
	t.Cleanup(func() { repairExecutable = originalExecutable })
	if err := os.WriteFile(target, []byte("old-desktop"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(guard, []byte("old-guard"), 0o700); err != nil {
		t.Fatal(err)
	}
	missingSibling := filepath.Join(dir, "reasonix-update-helper.exe")
	tx, err := PrepareFileUpdate("v1", "v2", target, guard, missingSibling)
	if err != nil {
		t.Fatal(err)
	}
	if len(tx.Files) != 2 {
		t.Fatalf("release unit files = %+v", tx.Files)
	}
	if err := os.WriteFile(target, []byte("new-desktop"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(guard, []byte("new-guard"), 0o700); err != nil {
		t.Fatal(err)
	}
	result, err := RollbackPendingUpdate()
	if err != nil {
		t.Fatal(err)
	}
	if !result.RolledBack || result.ToVersion != "v1" {
		t.Fatalf("rollback result = %+v", result)
	}
	for path, want := range map[string]string{target: "old-desktop", guard: "old-guard"} {
		got, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if string(got) != want {
			t.Fatalf("restored %s = %q, want %q", filepath.Base(path), got, want)
		}
	}
}

func TestCancelPendingUpdateRemovesReleaseUnitBackups(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REASONIX_HOME", home)
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(dir, "reasonix-desktop")
	guard := filepath.Join(dir, "reasonix-guard")
	originalExecutable := repairExecutable
	repairExecutable = func() (string, error) { return guard, nil }
	t.Cleanup(func() { repairExecutable = originalExecutable })
	for path, body := range map[string]string{target: "desktop", guard: "guard"} {
		if err := os.WriteFile(path, []byte(body), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	tx, err := PrepareFileUpdate("v1", "v2", target, guard)
	if err != nil {
		t.Fatal(err)
	}
	if err := CancelPendingUpdate("v2"); err != nil {
		t.Fatal(err)
	}
	if HasPendingUpdate() {
		t.Fatal("pending update remains after cancel")
	}
	for _, f := range tx.Files {
		if _, err := os.Stat(f.BackupPath); !os.IsNotExist(err) {
			t.Fatalf("backup %s still exists: %v", f.BackupPath, err)
		}
	}
}

func TestHealthyUpdateRemovesBackup(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REASONIX_HOME", home)
	target := filepath.Join(t.TempDir(), "reasonix-desktop")
	originalExecutable := repairExecutable
	repairExecutable = func() (string, error) { return filepath.Join(filepath.Dir(target), "reasonix-guard"), nil }
	t.Cleanup(func() { repairExecutable = originalExecutable })
	if err := os.WriteFile(target, []byte("old"), 0o700); err != nil {
		t.Fatal(err)
	}
	tx, err := PrepareFileUpdate("v1", "v2", target)
	if err != nil {
		t.Fatal(err)
	}
	if err := MarkUpdateHealthy("v1"); err != nil {
		t.Fatal(err)
	}
	if !HasPendingUpdate() {
		t.Fatal("mismatched version committed pending update")
	}
	if err := MarkUpdateHealthy("v2"); err != nil {
		t.Fatal(err)
	}
	if HasPendingUpdate() {
		t.Fatal("pending update remains after health confirmation")
	}
	if _, err := os.Stat(tx.BackupPath); !os.IsNotExist(err) {
		t.Fatalf("backup still exists: %v", err)
	}
}
