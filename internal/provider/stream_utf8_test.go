package provider

import (
	"bytes"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"testing"
)

func TestValidateStreamUTF8AcceptsValidFrames(t *testing.T) {
	// Boundary cases: empty, ASCII, multibyte Chinese, and U+FFFD itself are valid.
	for _, frame := range [][]byte{nil, []byte("data: {}"), []byte("data: 中文"), []byte("data: �")} {
		if err := ValidateStreamUTF8(StreamUTF8Context{Provider: "test", Protocol: "openai", Line: 1}, frame); err != nil {
			t.Fatalf("ValidateStreamUTF8(%q): %v", frame, err)
		}
	}
}

func TestValidateStreamUTF8RejectsAndRedactsMalformedFrames(t *testing.T) {
	// Boundary cases: invalid leading, continuation, and truncated multibyte bytes
	// must fail at the first malformed byte without logging adjacent content.
	frames := [][]byte{
		append([]byte("data: secret-"), 0xff),
		append([]byte("data: secret-"), 0x80),
		append([]byte("data: secret-"), 0xe4, 0xb8),
	}
	for _, frame := range frames {
		var logOutput bytes.Buffer
		previous := slog.Default()
		slog.SetDefault(slog.New(slog.NewTextHandler(&logOutput, nil)))

		err := ValidateStreamUTF8(StreamUTF8Context{
			Provider:  "gateway",
			Model:     "glm-5.2",
			Protocol:  "openai",
			RequestID: "request-123",
			Line:      7,
		}, frame)
		slog.SetDefault(previous)

		var invalid *InvalidStreamUTF8Error
		if !errors.As(err, &invalid) {
			t.Fatalf("error = %T %v, want InvalidStreamUTF8Error", err, err)
		}
		if invalid.ByteOffset != len("data: secret-") || invalid.FrameBytes != len(frame) {
			t.Fatalf("diagnostic = %+v, want offset=%d bytes=%d", invalid, len("data: secret-"), len(frame))
		}
		logged := logOutput.String()
		for _, want := range []string{"diagnostic_id", "request-123", "frame_sha256", "byte_offset=13", "frame_bytes"} {
			if !strings.Contains(logged, want) {
				t.Fatalf("diagnostic log = %q, want %q", logged, want)
			}
		}
		if strings.Contains(logged, "secret-") {
			t.Fatalf("diagnostic log leaked frame content: %q", logged)
		}
	}
}

func TestLogStreamReplacementRunesRedactsValidReplacementFrames(t *testing.T) {
	var logOutput bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logOutput, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	frame := []byte(`data: {"content":"secret-�-�"}`)
	LogStreamReplacementRunes(StreamUTF8Context{
		Provider: "gateway", Model: "glm-5.2", Protocol: "openai", RequestID: "request-456", Line: 9,
	}, frame, CountReplacementRunes("secret-�-�"))

	logged := logOutput.String()
	for _, want := range []string{"U+FFFD", "request-456", "replacement_runes=2", "frame_sha256"} {
		if !strings.Contains(logged, want) {
			t.Fatalf("diagnostic log = %q, want %q", logged, want)
		}
	}
	if strings.Contains(logged, "secret-") {
		t.Fatalf("diagnostic log leaked frame content: %q", logged)
	}
}

func TestStreamRequestIDAllowsOnlyBoundedCorrelationValues(t *testing.T) {
	header := http.Header{"X-Request-Id": []string{"request-123"}}
	if got := StreamRequestID(header); got != "request-123" {
		t.Fatalf("StreamRequestID = %q, want request-123", got)
	}
	header.Set("X-Request-ID", "secret\nAuthorization: Bearer token")
	if got := StreamRequestID(header); got != "" {
		t.Fatalf("StreamRequestID unsafe value = %q, want empty", got)
	}
}
