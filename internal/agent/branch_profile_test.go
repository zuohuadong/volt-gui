package agent

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestEmptyBranchMetaOmitsAgentProfileTimestamp(t *testing.T) {
	b, err := json.Marshal(BranchMeta{})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), "agent_profile_updated_at") {
		t.Fatalf("empty profile timestamp leaked into legacy metadata: %s", b)
	}
}
