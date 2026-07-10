package control

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const tinyPNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

func TestSaveImageDataURL(t *testing.T) {
	t.Chdir(t.TempDir())
	got, err := SaveImageDataURL("data:image/png;base64," + tinyPNG)
	if err != nil {
		t.Fatalf("SaveImageDataURL: %v", err)
	}
	if !strings.HasPrefix(got, ".voltui/attachments/clipboard-") || !strings.HasSuffix(got, ".png") {
		t.Fatalf("path = %q, want attachment png path", got)
	}
}

func TestSaveImageDataURLRejectsSpoofedMime(t *testing.T) {
	t.Chdir(t.TempDir())
	if _, err := SaveImageDataURL("data:image/png;base64,aGk="); err == nil {
		t.Fatal("spoofed image mime should fail")
	}
}

func TestCreateAttachmentFileSkipsExistingPath(t *testing.T) {
	t.Chdir(t.TempDir())
	if err := ensureAttachmentRoot(); err != nil {
		t.Fatal(err)
	}

	first := attachmentPath(".png")
	if err := os.WriteFile(first, []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}

	rel, f, err := createAttachmentFile(".png")
	if err != nil {
		t.Fatalf("createAttachmentFile: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	if rel == first {
		t.Fatalf("createAttachmentFile reused existing path %q", rel)
	}
	if got, err := os.ReadFile(first); err != nil {
		t.Fatal(err)
	} else if string(got) != "keep" {
		t.Fatalf("existing attachment was overwritten: %q", got)
	}
}

func TestSaveImageBytesUsesUniquePathsWithinSameTimestamp(t *testing.T) {
	t.Chdir(t.TempDir())
	oldNow := attachmentNow
	attachmentNow = func() time.Time {
		return time.Date(2026, 6, 1, 10, 20, 30, 123456000, time.UTC)
	}
	defer func() {
		attachmentNow = oldNow
	}()

	raw := mustBase64(t, tinyPNG)
	first, err := SaveImageBytes("image/png", raw)
	if err != nil {
		t.Fatalf("first SaveImageBytes: %v", err)
	}
	second, err := SaveImageBytes("image/png", raw)
	if err != nil {
		t.Fatalf("second SaveImageBytes: %v", err)
	}
	if first == second {
		t.Fatalf("paths collided: %q", first)
	}
	for _, path := range []string{first, second} {
		if got, err := os.ReadFile(path); err != nil {
			t.Fatalf("read %s: %v", path, err)
		} else if string(got) != string(raw) {
			t.Fatalf("content for %s changed", path)
		}
	}
}

func TestSaveImageFile(t *testing.T) {
	t.Chdir(t.TempDir())
	if err := os.WriteFile("source.png", mustBase64(t, tinyPNG), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := SaveImageFile("source.png")
	if err != nil {
		t.Fatalf("SaveImageFile: %v", err)
	}
	if !strings.HasPrefix(got, ".voltui/attachments/clipboard-") || !strings.HasSuffix(got, ".png") {
		t.Fatalf("path = %q, want attachment png path", got)
	}
}

func TestSaveAttachmentFile(t *testing.T) {
	t.Chdir(t.TempDir())
	if err := os.WriteFile("notes.pdf", []byte("%PDF-1.4 body"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := SaveAttachmentFile("notes.pdf")
	if err != nil {
		t.Fatalf("SaveAttachmentFile: %v", err)
	}
	if !strings.HasPrefix(got, ".voltui/attachments/clipboard-") || !strings.HasSuffix(got, ".pdf") {
		t.Fatalf("path = %q, want attachment pdf path", got)
	}
	if data, err := os.ReadFile(got); err != nil || string(data) != "%PDF-1.4 body" {
		t.Fatalf("stored bytes = %q (err %v), want original", data, err)
	}
}

func TestSaveAttachmentFileWithExpectedInfoRejectsReplacedSource(t *testing.T) {
	workspace := t.TempDir()
	t.Chdir(workspace)

	source := filepath.Join(t.TempDir(), "selected.pdf")
	if err := os.WriteFile(source, []byte("%PDF-1.7 original"), 0o644); err != nil {
		t.Fatal(err)
	}
	expected, err := os.Lstat(source)
	if err != nil {
		t.Fatal(err)
	}
	replacement := source + ".replacement"
	if err := os.WriteFile(replacement, []byte("%PDF-1.7 replacement"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(replacement, source); err != nil {
		t.Fatal(err)
	}

	if _, err := SaveAttachmentFileWithExpectedInfo(source, expected); err == nil {
		t.Fatal("replacement after selection should be rejected")
	}
	if _, err := os.Stat(filepath.Join(workspace, ".voltui", "attachments")); !os.IsNotExist(err) {
		t.Fatalf("rejected source should not create an attachment, stat err=%v", err)
	}
}

func TestSaveAttachmentFileAcceptsThirtySevenMiBPDF(t *testing.T) {
	t.Chdir(t.TempDir())
	const size = 37*1024*1024 + 200*1024
	pdf := make([]byte, size)
	copy(pdf, "%PDF-1.7\n")
	if err := os.WriteFile("report.pdf", pdf, 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := SaveAttachmentFile("report.pdf")
	if err != nil {
		t.Fatalf("SaveAttachmentFile: %v", err)
	}
	if !strings.HasPrefix(got, ".voltui/attachments/") || !strings.HasSuffix(got, ".pdf") {
		t.Fatalf("path = %q, want attachment pdf path", got)
	}
	info, err := os.Stat(got)
	if err != nil {
		t.Fatalf("stat stored PDF: %v", err)
	}
	if info.Size() != size {
		t.Fatalf("stored PDF size = %d, want %d", info.Size(), size)
	}
}

func TestSaveAttachmentFileRejectsMoreThanSixtyFourMiB(t *testing.T) {
	t.Chdir(t.TempDir())
	f, err := os.Create("too-large.pdf")
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Truncate(maxFileAttachmentBytes + 1); err != nil {
		_ = f.Close()
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}

	if _, err := SaveAttachmentFile("too-large.pdf"); err == nil || !strings.Contains(err.Error(), "64 MiB") {
		t.Fatalf("SaveAttachmentFile oversized error = %v, want 64 MiB limit", err)
	}
}

func TestSaveAttachmentFileDoesNotExposeSourcePath(t *testing.T) {
	source := filepath.Join(t.TempDir(), "missing.pdf")
	if _, err := SaveAttachmentFile(source); err == nil {
		t.Fatal("missing attachment source should fail")
	} else if strings.Contains(err.Error(), source) {
		t.Fatalf("attachment error leaked source path: %v", err)
	}
}

func TestSaveAttachmentFileRejectsEmptyAndDir(t *testing.T) {
	t.Chdir(t.TempDir())
	if err := os.WriteFile("empty.txt", nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := SaveAttachmentFile("empty.txt"); err == nil {
		t.Fatal("empty file should fail")
	}
	if err := os.Mkdir("adir", 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := SaveAttachmentFile("adir"); err == nil {
		t.Fatal("directory should fail")
	}
}

func TestSaveAttachmentFileSanitizesExtension(t *testing.T) {
	t.Chdir(t.TempDir())
	if err := os.WriteFile("payload.weird-ext-here", []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := SaveAttachmentFile("payload.weird-ext-here")
	if err != nil {
		t.Fatalf("SaveAttachmentFile: %v", err)
	}
	if !strings.HasSuffix(got, ".bin") {
		t.Fatalf("path = %q, want .bin fallback for unsafe extension", got)
	}
}

func TestSaveAttachmentFileRejectsSymlink(t *testing.T) {
	t.Chdir(t.TempDir())
	if err := os.WriteFile("source.bin", []byte("payload"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("source.bin", "link.bin"); err != nil {
		t.Skipf("symlink unsupported: %v", err)
	}
	if _, err := SaveAttachmentFile("link.bin"); err == nil {
		t.Fatal("symlink attachment path should fail")
	}
}

func TestSaveImageFileRejectsSymlink(t *testing.T) {
	t.Chdir(t.TempDir())
	if err := os.WriteFile("source.png", mustBase64(t, tinyPNG), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("source.png", "link.png"); err != nil {
		t.Skipf("symlink unsupported: %v", err)
	}
	if _, err := SaveImageFile("link.png"); err == nil {
		t.Fatal("symlink image path should fail")
	}
}

func TestImageDataURLRejectsOutsideAttachmentDir(t *testing.T) {
	t.Chdir(t.TempDir())
	if err := os.WriteFile("x.png", []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := ImageDataURL("x.png"); err == nil {
		t.Fatal("outside attachment dir should fail")
	}
	if _, err := ImageDataURL("../.voltui/attachments/x.png"); err == nil {
		t.Fatal("traversal path should fail")
	}
}

func TestImageDataURLRejectsSymlinkFile(t *testing.T) {
	t.Chdir(t.TempDir())
	if err := ensureAttachmentRoot(); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile("secret.png", []byte("secret"), 0o644); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(".voltui", "attachments", "link.png")
	if err := os.Symlink(filepath.Join("..", "..", "secret.png"), link); err != nil {
		t.Skipf("symlink unsupported: %v", err)
	}
	if _, err := ImageDataURL(link); err == nil {
		t.Fatal("symlink attachment file should fail")
	}
}

func TestImageDataURLRejectsSymlinkAttachmentDir(t *testing.T) {
	t.Chdir(t.TempDir())
	if err := os.Mkdir(".voltui", 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir("elsewhere", 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("../elsewhere", filepath.Join(".voltui", "attachments")); err != nil {
		t.Skipf("symlink unsupported: %v", err)
	}
	if _, err := ImageDataURL(".voltui/attachments/x.png"); err == nil {
		t.Fatal("symlink attachment directory should fail")
	}
}

func TestImageDataURLRejectsSymlinkSubdirectory(t *testing.T) {
	t.Chdir(t.TempDir())
	if err := ensureAttachmentRoot(); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir("outside", 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join("outside", "x.png"), mustBase64(t, tinyPNG), 0o644); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(".voltui", "attachments", "link")
	if err := os.Symlink(filepath.Join("..", "..", "outside"), link); err != nil {
		t.Skipf("symlink unsupported: %v", err)
	}
	if _, err := ImageDataURL(filepath.Join(link, "x.png")); err == nil {
		t.Fatal("symlink attachment subdirectory should fail")
	}
}

func mustBase64(t *testing.T, s string) []byte {
	t.Helper()
	raw, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
