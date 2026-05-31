package cli

import (
	"strings"
	"testing"
)

// TestClampStatusLine verifies the status line is truncated to the terminal
// width (ANSI-aware) so it never wraps to a second row and drifts the layout.
func TestClampStatusLine(t *testing.T) {
	// A line within width is returned unchanged.
	if got := clampStatusLine("[auto] · idle", 40); got != "[auto] · idle" {
		t.Errorf("in-width line was altered: %q", got)
	}

	// A plain over-wide line is clamped to width with a trailing ellipsis.
	got := clampStatusLine("abcdefghijklmnop", 5)
	if visibleWidth(got) > 5 {
		t.Errorf("clamped width = %d, want <= 5 (%q)", visibleWidth(got), got)
	}
	if !strings.HasSuffix(got, "…\x1b[0m") {
		t.Errorf("expected ellipsis+reset suffix, got %q", got)
	}

	// ANSI SGR codes carry no width and must not be counted or split: a line
	// whose bytes are long but whose visible width fits stays unchanged.
	styled := "\x1b[2mcache 88% · avg 78%\x1b[0m" // 19 visible cols, many extra bytes
	if got := clampStatusLine(styled, 30); got != styled {
		t.Errorf("styled in-width line altered: %q", got)
	}

	// A styled over-wide line clamps by VISIBLE width, not byte length.
	wide := "\x1b[31m[YOLO]\x1b[0m · 12k/1M ctx (1%) · cache 88% · avg 78% · ¥1.23"
	c := clampStatusLine(wide, 20)
	if visibleWidth(c) > 20 {
		t.Errorf("styled clamp width = %d, want <= 20 (%q)", visibleWidth(c), c)
	}
}
