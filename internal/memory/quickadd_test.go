package memory

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestAppendDocCreatesAndAppends verifies the "#" quick-add path: a fresh file
// gets a Notes section, and a second note joins the same section rather than
// scattering.
func TestAppendDocCreatesAndAppends(t *testing.T) {
	path := filepath.Join(t.TempDir(), "VOLTUI.md")

	if err := AppendDoc(path, "first note"); err != nil {
		t.Fatal(err)
	}
	if err := AppendDoc(path, "second note"); err != nil {
		t.Fatal(err)
	}

	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	body := string(b)
	if strings.Count(body, quickAddHeading) != 1 {
		t.Fatalf("want exactly one Notes section, got:\n%s", body)
	}
	if !strings.Contains(body, "- first note") || !strings.Contains(body, "- second note") {
		t.Fatalf("notes missing:\n%s", body)
	}
	// Order preserved: first before second.
	if strings.Index(body, "first note") > strings.Index(body, "second note") {
		t.Fatalf("notes out of order:\n%s", body)
	}
}

// TestAppendDocPreservesExistingContent verifies a hand-written file keeps its
// content and the note lands under a Notes section appended to the end.
func TestAppendDocPreservesExistingContent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "VOLTUI.md")
	original := "# My project\n\nSome existing guidance the user wrote.\n"
	if err := os.WriteFile(path, []byte(original), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := AppendDoc(path, "added via hash"); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(path)
	body := string(b)
	if !strings.Contains(body, "Some existing guidance the user wrote.") {
		t.Fatalf("existing content lost:\n%s", body)
	}
	if !strings.Contains(body, "- added via hash") {
		t.Fatalf("note not added:\n%s", body)
	}
}

// TestAppendDocNormalizesNote ensures a multi-line note can't corrupt the
// single-line bullet format.
func TestAppendDocNormalizesNote(t *testing.T) {
	path := filepath.Join(t.TempDir(), "VOLTUI.md")
	if err := AppendDoc(path, "line one\nline two\t with   spaces"); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(path)
	body := string(b)
	if !strings.Contains(body, "- line one line two with spaces") {
		t.Fatalf("note not normalised to one line:\n%s", body)
	}
}

func TestAppendDocRejectsSymlinkDestination(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation requires elevated privileges on common Windows setups")
	}
	outside := filepath.Join(t.TempDir(), "outside.md")
	if err := os.WriteFile(outside, []byte("keep me"), 0o644); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(t.TempDir(), "AGENTS.md")
	if err := os.Symlink(outside, link); err != nil {
		t.Fatal(err)
	}

	if err := AppendDoc(link, "must stay local"); err == nil {
		t.Fatal("AppendDoc followed a symlink destination")
	}
	body, err := os.ReadFile(outside)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != "keep me" {
		t.Fatalf("outside target changed to %q", body)
	}
}

func TestAppendDocPreservesPrivateMode(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX permission bits are not portable to Windows")
	}
	path := filepath.Join(t.TempDir(), "AGENTS.md")
	if err := os.WriteFile(path, []byte("private"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := AppendDoc(path, "keep permissions"); err != nil {
		t.Fatal(err)
	}
	fileInfo, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := fileInfo.Mode().Perm(); got != 0o600 {
		t.Fatalf("mode = %04o, want 0600", got)
	}
}

func TestAppendDocDoesNotReplaceUnreadableDestination(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX unreadable-file semantics are not portable to Windows")
	}
	path := filepath.Join(t.TempDir(), "AGENTS.md")
	const original = "private and unreadable"
	if err := os.WriteFile(path, []byte(original), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(path, 0o600) })
	if file, err := os.Open(path); err == nil {
		_ = file.Close()
		t.Skip("current user can read mode-000 files")
	}
	if err := AppendDoc(path, "must not replace"); err == nil {
		t.Fatal("AppendDoc replaced an unreadable file")
	}
	if err := os.Chmod(path, 0o600); err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != original {
		t.Fatalf("unreadable destination changed to %q", body)
	}
}

func TestAppendDocPropagatesReadErrors(t *testing.T) {
	path := filepath.Join(t.TempDir(), "AGENTS.md")
	if err := os.Mkdir(path, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := AppendDoc(path, "must not replace"); err == nil {
		t.Fatal("AppendDoc swallowed a destination read error")
	}
	fileInfo, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if !fileInfo.IsDir() {
		t.Fatal("read-error destination was replaced")
	}
}

func TestDocSnapshotRejectsSwapBeforeOpen(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation requires elevated privileges on common Windows setups")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "AGENTS.md")
	outside := filepath.Join(dir, "outside.md")
	if err := os.WriteFile(path, []byte("original"), 0o600); err != nil {
		t.Fatal(err)
	}
	expected, err := os.Lstat(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(outside, []byte("OUTSIDE SECRET"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, path); err != nil {
		t.Fatal(err)
	}
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if _, err := readOpenedDocSnapshot(path, file, expected); err == nil {
		t.Fatal("snapshot accepted a file swapped before open")
	}
}

func TestStrictPublishReplacesSwappedSymlinkWithoutFollowingIt(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation requires elevated privileges on common Windows setups")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "AGENTS.md")
	outside := filepath.Join(dir, "outside.md")
	if err := os.WriteFile(path, []byte("original"), 0o600); err != nil {
		t.Fatal(err)
	}
	snapshot, err := readDocSnapshot(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(outside, []byte("OUTSIDE SECRET"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, path); err != nil {
		t.Fatal(err)
	}
	if err := publishDoc(path, []byte("replacement"), snapshot.mode); err != nil {
		t.Fatal(err)
	}
	outsideBody, err := os.ReadFile(outside)
	if err != nil {
		t.Fatal(err)
	}
	if string(outsideBody) != "OUTSIDE SECRET" {
		t.Fatalf("strict publish followed swapped symlink: %q", outsideBody)
	}
	fileInfo, err := os.Lstat(path)
	if err != nil {
		t.Fatal(err)
	}
	if fileInfo.Mode()&os.ModeSymlink != 0 {
		t.Fatal("strict publish left the swapped symlink in place")
	}
}
