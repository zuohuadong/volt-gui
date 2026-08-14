package provider

import (
	"context"
	cryptorand "crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync/atomic"
	"time"
	"unicode"
	"unicode/utf8"
)

const maxStreamDiagnosticLabelBytes = 128

var streamDiagnosticSequence atomic.Uint64

// StreamUTF8Context identifies an SSE frame without carrying its content.
type StreamUTF8Context struct {
	Provider        string
	Model           string
	Protocol        string
	ClientRequestID string
	RequestID       string
	Line            int
}

type clientRequestIDKey struct{}

// NewClientRequestID returns a UUIDv4-safe correlation ID for one logical
// provider stream. It contains no request content or credential material.
func NewClientRequestID() (string, error) {
	var raw [16]byte
	if _, err := cryptorand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("generate client request ID: %w", err)
	}
	raw[6] = raw[6]&0x0f | 0x40
	raw[8] = raw[8]&0x3f | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		raw[0:4], raw[4:6], raw[6:8], raw[8:10], raw[10:16]), nil
}

// WithClientRequestID stores a bounded correlation ID on the logical stream
// context so retries and stream diagnostics refer to the same user request.
func WithClientRequestID(ctx context.Context, requestID string) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	if safe, ok := safeDiagnosticLabel(requestID); ok {
		return context.WithValue(ctx, clientRequestIDKey{}, safe)
	}
	return ctx
}

// ClientRequestID returns the correlation ID attached to a provider request.
func ClientRequestID(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	requestID, _ := ctx.Value(clientRequestIDKey{}).(string)
	return requestID
}

// InvalidStreamUTF8Error reports a rejected frame using content-free metadata.
type InvalidStreamUTF8Error struct {
	DiagnosticID string
	Provider     string
	Protocol     string
	Line         int
	ByteOffset   int
	FrameBytes   int
}

func (e *InvalidStreamUTF8Error) Error() string {
	return fmt.Sprintf(
		"%s: invalid UTF-8 in %s stream (diagnostic_id=%s line=%d byte_offset=%d frame_bytes=%d)",
		e.Provider, e.Protocol, e.DiagnosticID, e.Line, e.ByteOffset, e.FrameBytes,
	)
}

// ValidateStreamUTF8 rejects malformed provider bytes before string conversion
// or JSON decoding can replace them with U+FFFD.
func ValidateStreamUTF8(streamContext StreamUTF8Context, frame []byte) error {
	if utf8.Valid(frame) {
		return nil
	}
	diagnostic := newInvalidStreamUTF8Error(streamContext, frame)
	logInvalidStreamUTF8(streamContext, diagnostic, frame)
	return diagnostic
}

func newInvalidStreamUTF8Error(streamContext StreamUTF8Context, frame []byte) *InvalidStreamUTF8Error {
	return &InvalidStreamUTF8Error{
		DiagnosticID: nextStreamDiagnosticID(),
		Provider:     diagnosticLabel(streamContext.Provider),
		Protocol:     diagnosticLabel(streamContext.Protocol),
		Line:         streamContext.Line,
		ByteOffset:   firstInvalidUTF8Offset(frame),
		FrameBytes:   len(frame),
	}
}

func logInvalidStreamUTF8(streamContext StreamUTF8Context, diagnostic *InvalidStreamUTF8Error, frame []byte) {
	digest := sha256.Sum256(frame)
	slog.Error("provider: rejected invalid UTF-8 SSE frame",
		"diagnostic_id", diagnostic.DiagnosticID,
		"provider", diagnostic.Provider,
		"model", diagnosticLabel(streamContext.Model),
		"protocol", diagnostic.Protocol,
		"client_request_id", optionalDiagnosticLabel(streamContext.ClientRequestID),
		"request_id", optionalDiagnosticLabel(streamContext.RequestID),
		"line", diagnostic.Line,
		"byte_offset", diagnostic.ByteOffset,
		"frame_bytes", diagnostic.FrameBytes,
		"frame_sha256", hex.EncodeToString(digest[:]),
	)
}

// LogStreamReplacementRunes records when a valid provider frame already
// contains U+FFFD, which distinguishes upstream replacement from local decoding.
func LogStreamReplacementRunes(streamContext StreamUTF8Context, frame []byte, count int) {
	if count <= 0 {
		return
	}
	digest := sha256.Sum256(frame)
	slog.Warn("provider: SSE frame contains U+FFFD replacement rune",
		"diagnostic_id", nextStreamDiagnosticID(),
		"provider", diagnosticLabel(streamContext.Provider),
		"model", diagnosticLabel(streamContext.Model),
		"protocol", diagnosticLabel(streamContext.Protocol),
		"client_request_id", optionalDiagnosticLabel(streamContext.ClientRequestID),
		"request_id", optionalDiagnosticLabel(streamContext.RequestID),
		"line", streamContext.Line,
		"frame_bytes", len(frame),
		"replacement_runes", count,
		"frame_sha256", hex.EncodeToString(digest[:]),
	)
}

// CountReplacementRunes counts decoded U+FFFD values without retaining text.
func CountReplacementRunes(decodedFields ...string) int {
	count := 0
	for _, decodedField := range decodedFields {
		count += strings.Count(decodedField, "�")
	}
	return count
}

func nextStreamDiagnosticID() string {
	return fmt.Sprintf("utf8-%d-%d", time.Now().UTC().UnixMilli(), streamDiagnosticSequence.Add(1))
}

func firstInvalidUTF8Offset(frame []byte) int {
	for offset := 0; offset < len(frame); {
		r, size := utf8.DecodeRune(frame[offset:])
		if r == utf8.RuneError && size == 1 {
			return offset
		}
		offset += size
	}
	return -1
}

// StreamRequestID reads only known correlation headers and rejects values that
// could inject content or credentials into local diagnostics.
func StreamRequestID(header http.Header) string {
	for _, name := range []string{"X-Request-ID", "Request-ID", "X-Trace-ID"} {
		if requestID, ok := safeDiagnosticLabel(header.Get(name)); ok {
			return requestID
		}
	}
	return ""
}

func diagnosticLabel(raw string) string {
	if label, ok := safeDiagnosticLabel(raw); ok {
		return label
	}
	return "[redacted]"
}

func optionalDiagnosticLabel(raw string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	return diagnosticLabel(raw)
}

func safeDiagnosticLabel(raw string) (string, bool) {
	label := strings.TrimSpace(raw)
	if label == "" {
		return "", false
	}
	if len(label) > maxStreamDiagnosticLabelBytes || !utf8.ValidString(label) {
		return "", false
	}
	for _, r := range label {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) && !strings.ContainsRune("-._:/", r) {
			return "", false
		}
	}
	return label, true
}
