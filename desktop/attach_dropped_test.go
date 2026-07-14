package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"voltui/internal/control"
)

const desktopTinyPNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

func TestWorkspaceRelativeIn(t *testing.T) {
	root := t.TempDir()

	if rel, ok := workspaceRelativeIn(filepath.Join(root, "sub", "file.go"), root); !ok || rel != "sub/file.go" {
		t.Fatalf("in-tree = (%q, %v), want (sub/file.go, true)", rel, ok)
	}
	if _, ok := workspaceRelativeIn(filepath.Join(filepath.Dir(root), "sibling.txt"), root); ok {
		t.Fatal("a path above the workspace must not resolve as in-tree")
	}
}

func TestIsImageExt(t *testing.T) {
	for _, p := range []string{"a.png", "A.PNG", "b.jpeg", "c.webp"} {
		if !isImageExt(p) {
			t.Errorf("%q should be an image extension", p)
		}
	}
	for _, p := range []string{"notes.pdf", "main.go", "noext"} {
		if isImageExt(p) {
			t.Errorf("%q should not be an image extension", p)
		}
	}
}

func TestSavePastedImageUsesActiveWorkspaceRoot(t *testing.T) {
	orig, _ := os.Getwd()
	defer os.Chdir(orig)

	launchRoot := t.TempDir()
	projectRoot := t.TempDir()
	if err := os.Chdir(projectRoot); err != nil {
		t.Fatal(err)
	}
	projectRoot, _ = os.Getwd()
	if err := os.Chdir(launchRoot); err != nil {
		t.Fatal(err)
	}
	app := &App{
		tabs: map[string]*WorkspaceTab{
			"project": {ID: "project", WorkspaceRoot: projectRoot},
		},
		activeTabID: "project",
	}

	got, err := app.SavePastedImage("data:image/png;base64," + desktopTinyPNG)
	if err != nil {
		t.Fatalf("SavePastedImage: %v", err)
	}
	if _, err := os.Stat(filepath.Join(projectRoot, filepath.FromSlash(got))); err != nil {
		t.Fatalf("pasted image should be saved under active workspace: %v", err)
	}
	if _, err := os.Stat(filepath.Join(launchRoot, filepath.FromSlash(got))); !os.IsNotExist(err) {
		t.Fatalf("pasted image should not be saved under launch root, stat err=%v", err)
	}
	preview, err := app.AttachmentDataURL(got)
	if err != nil {
		t.Fatalf("AttachmentDataURL: %v", err)
	}
	if !strings.HasPrefix(preview, "data:image/png;base64,") {
		t.Fatalf("preview = %q, want png data URL", preview)
	}
}

func TestConcurrentPastedFilesStayInActiveWorkspace(t *testing.T) {
	orig, _ := os.Getwd()
	defer os.Chdir(orig)

	launchRoot := t.TempDir()
	projectRoot := t.TempDir()
	if err := os.Chdir(launchRoot); err != nil {
		t.Fatal(err)
	}
	launchRoot, _ = os.Getwd()
	app := &App{
		tabs: map[string]*WorkspaceTab{
			"project": {ID: "project", WorkspaceRoot: projectRoot},
		},
		activeTabID: "project",
	}
	dataURL := "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + base64.StdEncoding.EncodeToString([]byte("xlsx payload"))

	const count = 32
	start := make(chan struct{})
	refs := make(chan string, count)
	errs := make(chan error, count)
	var wg sync.WaitGroup
	for i := 0; i < count; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			ref, err := app.SavePastedFile("report.xlsx", dataURL)
			if err != nil {
				errs <- err
				return
			}
			refs <- ref
		}()
	}
	close(start)
	wg.Wait()
	close(refs)
	close(errs)

	for err := range errs {
		t.Fatalf("SavePastedFile: %v", err)
	}
	seen := map[string]bool{}
	for ref := range refs {
		if seen[ref] {
			t.Fatalf("duplicate attachment ref %q", ref)
		}
		seen[ref] = true
		if _, err := os.Stat(filepath.Join(projectRoot, filepath.FromSlash(ref))); err != nil {
			t.Fatalf("project attachment %q missing: %v", ref, err)
		}
		if _, err := os.Stat(filepath.Join(launchRoot, filepath.FromSlash(ref))); !os.IsNotExist(err) {
			t.Fatalf("attachment %q leaked into launch cwd, stat err=%v", ref, err)
		}
	}
	if len(seen) != count {
		t.Fatalf("saved refs = %d, want %d", len(seen), count)
	}
	if cwd, err := os.Getwd(); err != nil {
		t.Fatal(err)
	} else if cwd != launchRoot {
		t.Fatalf("process cwd = %q, want unchanged %q", cwd, launchRoot)
	}
}

func TestImportProjectMaterialFileUsesActiveWorkspaceRoot(t *testing.T) {
	orig, _ := os.Getwd()
	defer os.Chdir(orig)

	launchRoot := t.TempDir()
	projectRoot := t.TempDir()
	if err := os.Chdir(launchRoot); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(t.TempDir(), "report.pdf")
	content := []byte("%PDF-1.7 project material")
	if err := os.WriteFile(source, content, 0o644); err != nil {
		t.Fatal(err)
	}
	app := &App{
		tabs: map[string]*WorkspaceTab{
			"project": {ID: "project", WorkspaceRoot: projectRoot},
		},
		activeTabID: "project",
	}

	selected, err := app.registerProjectMaterialSelection(source)
	if err != nil {
		t.Fatalf("registerProjectMaterialSelection: %v", err)
	}
	got, err := app.ImportProjectMaterialFile(selected.SelectionToken)
	if err != nil {
		t.Fatalf("ImportProjectMaterialFile: %v", err)
	}
	if got.Name != "report.pdf" || got.Size != int64(len(content)) || got.MimeType != "application/pdf" {
		t.Fatalf("metadata = %+v, want report.pdf, %d bytes, application/pdf", got, len(content))
	}
	if !strings.HasPrefix(got.Path, ".voltui/attachments/") || !strings.HasSuffix(got.Path, ".pdf") {
		t.Fatalf("stored path = %q, want .voltui/attachments/*.pdf", got.Path)
	}
	stored, err := os.ReadFile(filepath.Join(projectRoot, filepath.FromSlash(got.Path)))
	if err != nil {
		t.Fatalf("read stored PDF: %v", err)
	}
	if string(stored) != string(content) {
		t.Fatalf("stored PDF bytes = %q, want %q", stored, content)
	}
	if _, err := os.Stat(filepath.Join(launchRoot, filepath.FromSlash(got.Path))); !os.IsNotExist(err) {
		t.Fatalf("project material should not be saved under launch root, stat err=%v", err)
	}
}

func TestImportProjectMaterialFileRejectsReplacedSelectionWithoutLeakingSourcePath(t *testing.T) {
	orig, _ := os.Getwd()
	defer os.Chdir(orig)

	launchRoot := t.TempDir()
	projectRoot := t.TempDir()
	if err := os.Chdir(launchRoot); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(t.TempDir(), "report.pdf")
	if err := os.WriteFile(source, []byte("%PDF-1.7 original"), 0o644); err != nil {
		t.Fatal(err)
	}
	app := &App{
		tabs: map[string]*WorkspaceTab{
			"project": {ID: "project", WorkspaceRoot: projectRoot},
		},
		activeTabID: "project",
	}

	selected, err := app.registerProjectMaterialSelection(source)
	if err != nil {
		t.Fatalf("registerProjectMaterialSelection: %v", err)
	}
	if selected.SelectionToken == "" {
		t.Fatal("selection token is empty")
	}
	encoded, err := json.Marshal(selected)
	if err != nil {
		t.Fatalf("marshal selected material: %v", err)
	}
	if strings.Contains(string(encoded), source) {
		t.Fatalf("picker result leaked source path: %s", encoded)
	}

	replacement := source + ".replacement"
	if err := os.WriteFile(replacement, []byte("%PDF-1.7 replacement"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(replacement, source); err != nil {
		t.Fatal(err)
	}

	if _, err := app.ImportProjectMaterialFile(selected.SelectionToken); err == nil {
		t.Fatal("replacement after selection should be rejected")
	} else if strings.Contains(err.Error(), source) {
		t.Fatalf("import error leaked source path: %v", err)
	}
	if _, err := app.ImportProjectMaterialFile(selected.SelectionToken); err == nil {
		t.Fatal("selection token should be one-time")
	}
	if _, err := os.Stat(filepath.Join(projectRoot, ".voltui", "attachments")); !os.IsNotExist(err) {
		t.Fatalf("rejected source should not create an attachment, stat err=%v", err)
	}
}

func TestAttachDroppedUsesActiveWorkspaceRoot(t *testing.T) {
	orig, _ := os.Getwd()
	defer os.Chdir(orig)

	launchRoot := t.TempDir()
	projectRoot := t.TempDir()
	if err := os.Chdir(projectRoot); err != nil {
		t.Fatal(err)
	}
	projectRoot, _ = os.Getwd()
	if err := os.Chdir(launchRoot); err != nil {
		t.Fatal(err)
	}
	app := &App{
		tabs: map[string]*WorkspaceTab{
			"project": {ID: "project", WorkspaceRoot: projectRoot},
		},
		activeTabID: "project",
	}
	if err := os.MkdirAll(filepath.Join(projectRoot, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(projectRoot, "sub", "notes.txt")
	if err := os.WriteFile(target, []byte("body"), 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := app.AttachDropped(target)
	if err != nil {
		t.Fatalf("AttachDropped: %v", err)
	}
	if got.Kind != "workspace" || got.Path != "sub/notes.txt" {
		t.Fatalf("got %+v, want workspace ref sub/notes.txt", got)
	}
}

func TestAttachDroppedImageUsesActiveWorkspaceRoot(t *testing.T) {
	orig, _ := os.Getwd()
	defer os.Chdir(orig)

	launchRoot := t.TempDir()
	projectRoot := t.TempDir()
	if err := os.Chdir(launchRoot); err != nil {
		t.Fatal(err)
	}
	app := &App{
		tabs: map[string]*WorkspaceTab{
			"project": {ID: "project", WorkspaceRoot: projectRoot},
		},
		activeTabID: "project",
	}
	raw, err := base64.StdEncoding.DecodeString(desktopTinyPNG)
	if err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "shot.png")
	if err := os.WriteFile(outside, raw, 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := app.AttachDropped(outside)
	if err != nil {
		t.Fatalf("AttachDropped: %v", err)
	}
	if got.Kind != "attachment" || !strings.HasSuffix(got.Path, ".png") {
		t.Fatalf("got %+v, want png attachment", got)
	}
	if _, err := os.Stat(filepath.Join(projectRoot, filepath.FromSlash(got.Path))); err != nil {
		t.Fatalf("dropped image should be saved under active workspace: %v", err)
	}
	if _, err := os.Stat(filepath.Join(launchRoot, filepath.FromSlash(got.Path))); !os.IsNotExist(err) {
		t.Fatalf("dropped image should not be saved under launch root, stat err=%v", err)
	}
	if !strings.HasPrefix(got.PreviewURL, "data:image/png;base64,") {
		t.Fatalf("preview = %q, want png data URL", got.PreviewURL)
	}
}

func TestAttachDroppedInWorkspaceReferencesInPlace(t *testing.T) {
	orig, _ := os.Getwd()
	defer os.Chdir(orig)

	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	cwd, _ := os.Getwd()
	if err := os.MkdirAll(filepath.Join(cwd, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(cwd, "sub", "notes.txt")
	if err := os.WriteFile(target, []byte("body"), 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := (&App{}).AttachDropped(target)
	if err != nil {
		t.Fatalf("AttachDropped: %v", err)
	}
	if got.Kind != "workspace" || got.Path != "sub/notes.txt" {
		t.Fatalf("got %+v, want workspace ref sub/notes.txt", got)
	}
}

func TestAttachDroppedOutsideWorkspaceCopiesToAttachments(t *testing.T) {
	orig, _ := os.Getwd()
	defer os.Chdir(orig)

	outside := filepath.Join(t.TempDir(), "report.pdf")
	if err := os.WriteFile(outside, []byte("%PDF body"), 0o644); err != nil {
		t.Fatal(err)
	}

	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}

	got, err := (&App{}).AttachDropped(outside)
	if err != nil {
		t.Fatalf("AttachDropped: %v", err)
	}
	if got.Kind != "attachment" || !strings.HasPrefix(got.Path, ".voltui/attachments/") || !strings.HasSuffix(got.Path, ".pdf") {
		t.Fatalf("got %+v, want copied pdf attachment", got)
	}
}

func TestAttachDroppedImageStoresThumbnail(t *testing.T) {
	orig, _ := os.Getwd()
	defer os.Chdir(orig)

	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	cwd, _ := os.Getwd()
	png := append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 64)...)
	if err := os.WriteFile(filepath.Join(cwd, "shot.png"), png, 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := (&App{}).AttachDropped(filepath.Join(cwd, "shot.png"))
	if err != nil {
		t.Fatalf("AttachDropped: %v", err)
	}
	if got.Kind != "attachment" || !strings.HasSuffix(got.Path, ".png") {
		t.Fatalf("got %+v, want png attachment", got)
	}
	if !strings.HasPrefix(got.PreviewURL, "data:image/png;base64,") {
		t.Fatalf("preview = %q, want png data URL", got.PreviewURL)
	}
}

func TestAttachDroppedOutsideWorkspaceDirRegistersWorkspaceRef(t *testing.T) {
	orig, _ := os.Getwd()
	defer os.Chdir(orig)

	workspace := t.TempDir()
	outside := filepath.Join(t.TempDir(), "Folder With Spaces")
	if err := os.MkdirAll(filepath.Join(outside, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(outside, "sub", "notes.txt"), []byte("notes"), 0o644); err != nil {
		t.Fatal(err)
	}
	expectedOutside := outside
	if resolved, err := filepath.EvalSymlinks(outside); err == nil {
		expectedOutside = resolved
	}
	expectedDisplayPath := filepath.ToSlash(expectedOutside)
	if err := os.Chdir(workspace); err != nil {
		t.Fatal(err)
	}

	ctrl := control.New(control.Options{WorkspaceRoot: workspace})
	app := &App{
		tabs: map[string]*WorkspaceTab{
			"project": {ID: "project", WorkspaceRoot: workspace, Ctrl: ctrl},
		},
		activeTabID: "project",
	}

	got, err := app.AttachDropped(outside)
	if err != nil {
		t.Fatalf("AttachDropped: %v", err)
	}
	if got.Kind != "workspace" || !got.IsDir {
		t.Fatalf("got %+v, want workspace directory ref", got)
	}
	if !strings.HasPrefix(got.Path, "__voltui_external_folder/") || strings.ContainsAny(got.Path, " \t\r\n") {
		t.Fatalf("external folder path token = %q, want whitespace-free external token", got.Path)
	}
	if got.DisplayPath != expectedDisplayPath {
		t.Fatalf("display path = %q, want %q", got.DisplayPath, expectedDisplayPath)
	}

	block, errs := ctrl.ResolveScopedRefs(context.Background(), "inspect @"+got.Path+"/")
	if len(errs) != 0 {
		t.Fatalf("ResolveScopedRefs errors = %v", errs)
	}
	if !strings.Contains(block, `<dir path="`+expectedDisplayPath+`">`) ||
		!strings.Contains(block, "sub/") ||
		!strings.Contains(block, "sub/notes.txt") {
		t.Fatalf("external dropped folder should resolve as dir context:\n%s", block)
	}
}
