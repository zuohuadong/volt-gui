package main

import (
	"strings"
	"testing"
	"time"

	"voltui/internal/agent"
)

func TestRecoveryCopyRequiresMatchingNonEmptyDigests(t *testing.T) {
	validA := strings.Repeat("a", 64)
	validB := strings.Repeat("b", 64)
	cases := []struct {
		name     string
		recovery string
		content  string
		want     bool
	}{
		{name: "unchanged", recovery: validA, content: validA, want: true},
		{name: "continued", recovery: validA, content: validB, want: false},
		{name: "malformed", recovery: "same", content: "same", want: false},
		{name: "missing content digest", recovery: validA, want: false},
		{name: "missing recovery digest", content: validA, want: false},
	}
	for _, tc := range cases {
		if got := recoveryDigestsIdentifyUnmodifiedCopy(tc.recovery, tc.content); got != tc.want {
			t.Errorf("%s: unmodified = %v, want %v", tc.name, got, tc.want)
		}
	}
}
