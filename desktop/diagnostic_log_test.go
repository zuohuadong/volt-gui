package main

import (
	"bytes"
	"io"
	"log/slog"
	"os"
	"strings"
	"testing"
)

func TestDesktopDiagnosticsPersistSlogOutput(t *testing.T) {
	diagnostics := startDesktopDiagnostics(t.TempDir())
	slog.Error("provider: rejected invalid UTF-8 SSE frame", "diagnostic_id", "utf8-test")
	logPath := diagnostics.path
	diagnostics.Close()

	if logPath == "" {
		t.Fatal("desktop diagnostic path is empty")
	}
	logBytes, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read desktop diagnostic log: %v", err)
	}
	for _, want := range []string{"rejected invalid UTF-8", "diagnostic_id=utf8-test"} {
		if !strings.Contains(string(logBytes), want) {
			t.Fatalf("diagnostic log = %q, want %q", logBytes, want)
		}
	}
}

func TestDesktopDiagnosticWriterStopsAtLimit(t *testing.T) {
	var destination bytes.Buffer
	writer := &desktopDiagnosticWriter{dst: &destination, remaining: 8}
	payload := strings.Repeat("x", 32)
	written, err := io.WriteString(writer, payload)
	if err != nil || written != len(payload) {
		t.Fatalf("Write = (%d, %v), want (%d, nil)", written, err, len(payload))
	}
	if !strings.HasPrefix(destination.String(), strings.Repeat("x", 8)) {
		t.Fatalf("bounded output = %q, want eight payload bytes first", destination.String())
	}
	if !strings.Contains(destination.String(), "diagnostic log limit reached") {
		t.Fatalf("bounded output = %q, want truncation marker", destination.String())
	}
}
