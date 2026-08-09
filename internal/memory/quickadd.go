package memory

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"voltui/internal/fileutil"
	fileencoding "voltui/internal/fileutil/encoding"
)

// quickAddHeading marks the section quick-added notes accumulate under, so
// repeated "#" additions group together instead of scattering through a
// hand-written file.
const quickAddHeading = "## Notes"

// AppendDoc appends a one-line note as a bullet under a "## Notes" section in
// the doc-memory file at path, creating the file (and section) when absent. The
// note is normalised to a single line so it can't corrupt the section. This is
// the write side of the "#" quick-add: a plain file edit the user can later
// reorganise by hand.
func AppendDoc(path, note string) error {
	note = oneLine(note)
	if note == "" {
		return nil
	}
	if err := ensureDocParent(path); err != nil {
		return err
	}
	snapshot, err := readDocSnapshot(path)
	if err != nil {
		return err
	}
	out := appendNote(string(snapshot.body), "- "+note)
	return publishDoc(path, []byte(out), snapshot.mode)
}

func appendNote(body, bullet string) string {
	switch {
	case strings.TrimSpace(body) == "":
		return "# Project memory\n\n" + quickAddHeading + "\n\n" + bullet + "\n"
	case strings.Contains(body, quickAddHeading):
		// Insert the bullet at the end of the existing Notes section (before the
		// next heading, or at EOF), keeping additions chronological.
		return insertUnderHeading(body, quickAddHeading, bullet)
	default:
		return strings.TrimRight(body, "\n") + "\n\n" + quickAddHeading + "\n\n" + bullet + "\n"
	}
}

// writeDocFile overwrites path with body, creating the parent directory and
// ensuring a single trailing newline. Used by Set.WriteDoc for the panel's
// in-place editor (path validation happens in the caller).
func writeDocFile(path, body string) error {
	if err := ensureDocParent(path); err != nil {
		return err
	}
	mode, err := destinationMode(path)
	if err != nil {
		return err
	}
	out := strings.TrimRight(body, "\n") + "\n"
	return publishDoc(path, []byte(out), mode)
}

func ensureDocParent(path string) error {
	if dir := filepath.Dir(path); dir != "" {
		return os.MkdirAll(dir, 0o755)
	}
	return nil
}

type docSnapshot struct {
	body []byte
	mode os.FileMode
}

func readDocSnapshot(path string) (docSnapshot, error) {
	expected, exists, err := destinationInfo(path)
	if err != nil {
		return docSnapshot{}, err
	}
	if !exists {
		return docSnapshot{mode: 0o644}, nil
	}
	file, err := os.Open(path)
	if err != nil {
		return docSnapshot{}, err
	}
	defer file.Close()
	return readOpenedDocSnapshot(path, file, expected)
}

func readOpenedDocSnapshot(path string, file *os.File, expectedInfo os.FileInfo) (docSnapshot, error) {
	openedInfo, err := file.Stat()
	if err != nil {
		return docSnapshot{}, err
	}
	if !os.SameFile(expectedInfo, openedInfo) {
		return docSnapshot{}, fmt.Errorf("memory destination changed while opening %q", path)
	}
	body, err := io.ReadAll(file)
	if err != nil {
		return docSnapshot{}, err
	}
	return docSnapshot{body: fileencoding.DecodeToUTF8(body), mode: openedInfo.Mode().Perm()}, nil
}

func destinationMode(path string) (os.FileMode, error) {
	fileInfo, exists, err := destinationInfo(path)
	if err != nil {
		return 0, err
	}
	if !exists {
		return 0o644, nil
	}
	return fileInfo.Mode().Perm(), nil
}

func destinationInfo(path string) (os.FileInfo, bool, error) {
	fileInfo, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if fileInfo.Mode()&os.ModeSymlink != 0 {
		return nil, false, fmt.Errorf("refusing to write %q through a symlink", path)
	}
	return fileInfo, true, nil
}

func publishDoc(path string, body []byte, mode os.FileMode) error {
	return fileutil.AtomicWriteFileStrict(path, body, mode)
}

// insertUnderHeading appends bullet to the end of the section started by heading
// — just before the next "## "/"# " heading, or at end of file if none follows.
func insertUnderHeading(body, heading, bullet string) string {
	lines := strings.Split(body, "\n")
	start := -1
	for i, l := range lines {
		if strings.TrimSpace(l) == heading {
			start = i
			break
		}
	}
	if start < 0 { // shouldn't happen (caller checked Contains), but stay safe
		return strings.TrimRight(body, "\n") + "\n\n" + bullet + "\n"
	}
	end := len(lines)
	for i := start + 1; i < len(lines); i++ {
		if strings.HasPrefix(strings.TrimSpace(lines[i]), "#") {
			end = i
			break
		}
	}
	// Trim trailing blank lines within the section, then place the bullet.
	insert := end
	for insert > start+1 && strings.TrimSpace(lines[insert-1]) == "" {
		insert--
	}
	out := append([]string{}, lines[:insert]...)
	out = append(out, bullet)
	out = append(out, lines[insert:]...)
	return strings.Join(out, "\n")
}
