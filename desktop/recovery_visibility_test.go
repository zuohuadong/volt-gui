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

func TestMergeSessionInfosKeepsContinuedRecoveryVisible(t *testing.T) {
	summaries := map[string]topicSummary{}
	infos := []agent.SessionInfo{{
		Path:           "/tmp/original-recovery-0123456789abcdef.jsonl",
		Turns:          5,
		LastActivityAt: time.Now(),
		Scope:          "global",
		TopicID:        "topic-continued",
		Recovered:      true,
		RecoveryDigest: strings.Repeat("a", 64),
		ContentDigest:  strings.Repeat("b", 64),
	}}

	mergeSessionInfos("/tmp", infos, map[string]string{}, map[string]agent.SessionInfo{}, map[string]string{}, summaries)
	summary := summaries[topicSummaryKey("global", "", "topic-continued")]
	if !summary.hasAdoptedRecovery || summary.hasRecoveryOnly {
		t.Fatalf("summary flags = %+v, want adopted recovery", summary)
	}
	if topicHiddenAsRecoveryOnly(summary, false, nil) {
		t.Fatal("continued recovery was hidden after its tab closed")
	}
	if got := summary.displayTurns(); got != 5 {
		t.Fatalf("display turns = %d, want 5", got)
	}
}

func TestSessionMetaSeparatesRecoveryProvenanceFromCleanupCopy(t *testing.T) {
	digest := strings.Repeat("a", 64)
	info := agent.SessionInfo{
		Path:           "/tmp/session-recovery-0123456789abcdef.jsonl",
		Recovered:      true,
		RecoveryDigest: digest,
		ContentDigest:  digest,
	}
	meta := sessionMetaFromInfo(info, "", false, false, 0)
	if !meta.Recovered || !meta.RecoveryCopy {
		t.Fatalf("unchanged recovery meta = %+v, want provenance and cleanup-copy flags", meta)
	}
	info.ContentDigest = strings.Repeat("b", 64)
	meta = sessionMetaFromInfo(info, "", false, false, 0)
	if !meta.Recovered || meta.RecoveryCopy {
		t.Fatalf("continued recovery meta = %+v, want provenance without cleanup-copy flag", meta)
	}
}
