package main

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExtractProjectMaterialTextPlainDocxAndPDF(t *testing.T) {
	dir := t.TempDir()

	textPath := filepath.Join(dir, "note.txt")
	if err := os.WriteFile(textPath, []byte("plain extraction needle"), 0o600); err != nil {
		t.Fatalf("write text: %v", err)
	}
	text, err := extractProjectMaterialText(textPath, "text/plain", "note.txt")
	if err != nil || !strings.Contains(text, "plain extraction needle") {
		t.Fatalf("text extraction = %q, err=%v", text, err)
	}

	docxPath := filepath.Join(dir, "doc.docx")
	writeTestDocx(t, docxPath, "docx extraction needle")
	text, err = extractProjectMaterialText(docxPath, "", "doc.docx")
	if err != nil || !strings.Contains(text, "docx extraction needle") {
		t.Fatalf("docx extraction = %q, err=%v", text, err)
	}

	pdfPath := filepath.Join(dir, "doc.pdf")
	if err := os.WriteFile(pdfPath, []byte("1 0 obj <<>> stream\nBT (pdf extraction needle) Tj ET\nendstream endobj"), 0o600); err != nil {
		t.Fatalf("write pdf: %v", err)
	}
	text, err = extractProjectMaterialText(pdfPath, "application/pdf", "doc.pdf")
	if err != nil || !strings.Contains(text, "pdf extraction needle") {
		t.Fatalf("pdf extraction = %q, err=%v", text, err)
	}
}

func writeTestDocx(t *testing.T, path, text string) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("create docx: %v", err)
	}
	zw := zip.NewWriter(file)
	w, err := zw.Create("word/document.xml")
	if err != nil {
		t.Fatalf("create document.xml: %v", err)
	}
	if _, err := w.Write([]byte(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>` + text + `</w:t></w:r></w:p></w:body></w:document>`)); err != nil {
		t.Fatalf("write document.xml: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close docx: %v", err)
	}
}
