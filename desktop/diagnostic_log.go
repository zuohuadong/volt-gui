package main

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	desktopDiagnosticLogLimit     = 4 << 20
	desktopDiagnosticLogRetention = 7 * 24 * time.Hour
)

type desktopDiagnostics struct {
	previous *slog.Logger
	logger   *slog.Logger
	file     *os.File
	path     string
	close    sync.Once
}

func startDesktopDiagnostics(reasonixHome string) *desktopDiagnostics {
	diagnostics := &desktopDiagnostics{previous: slog.Default()}
	writer := io.Writer(os.Stderr)
	if logDir := desktopDiagnosticLogDir(reasonixHome); logDir != "" {
		if file := createDesktopDiagnosticLog(logDir); file != nil {
			diagnostics.file = file
			diagnostics.path = file.Name()
			bounded := &desktopDiagnosticWriter{dst: file, remaining: desktopDiagnosticLogLimit}
			writer = io.MultiWriter(os.Stderr, bounded)
		}
	}
	diagnostics.logger = slog.New(slog.NewTextHandler(writer, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(diagnostics.logger)
	return diagnostics
}

func createDesktopDiagnosticLog(logDir string) *os.File {
	if err := os.MkdirAll(logDir, 0o700); err != nil {
		return nil
	}
	pruneDesktopDiagnosticLogs(logDir, time.Now())
	file, err := os.CreateTemp(logDir, "desktop-*.log")
	if err != nil {
		return nil
	}
	return file
}

func desktopDiagnosticLogDir(reasonixHome string) string {
	if strings.TrimSpace(reasonixHome) == "" {
		return ""
	}
	return filepath.Join(reasonixHome, "logs")
}

func pruneDesktopDiagnosticLogs(logDir string, now time.Time) {
	entries, err := os.ReadDir(logDir)
	if err != nil {
		return
	}
	cutoff := now.Add(-desktopDiagnosticLogRetention)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "desktop-") || !strings.HasSuffix(entry.Name(), ".log") {
			continue
		}
		entryInfo, err := entry.Info()
		if err == nil && entryInfo.ModTime().Before(cutoff) {
			_ = os.Remove(filepath.Join(logDir, entry.Name()))
		}
	}
}

func (d *desktopDiagnostics) Close() {
	if d == nil {
		return
	}
	d.close.Do(func() {
		if slog.Default() == d.logger && d.previous != nil {
			slog.SetDefault(d.previous)
		}
		if d.file != nil {
			_ = d.file.Close()
		}
	})
}

type desktopDiagnosticWriter struct {
	mu        sync.Mutex
	dst       io.Writer
	remaining int64
	truncated bool
}

func (w *desktopDiagnosticWriter) Write(payload []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	total := len(payload)
	if total == 0 || w.dst == nil || w.remaining <= 0 {
		return total, nil
	}
	writtenPayload := payload
	if int64(len(writtenPayload)) > w.remaining {
		writtenPayload = writtenPayload[:w.remaining]
	}
	written, err := w.dst.Write(writtenPayload)
	w.remaining -= int64(written)
	if err != nil || written != len(writtenPayload) {
		w.remaining = 0
		return total, nil
	}
	if written < total {
		w.markTruncated()
	}
	return total, nil
}

func (w *desktopDiagnosticWriter) markTruncated() {
	if w.truncated {
		return
	}
	w.truncated = true
	_, _ = io.WriteString(w.dst, "\nreasonix: desktop diagnostic log limit reached; further diagnostics omitted\n")
	w.remaining = 0
}
