package agent

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"voltui/internal/event"
	"voltui/internal/provider"
	"voltui/internal/tool"
)

// fakeImageTool models an MCP screenshot result: textual output and images
// use distinct channels.
type fakeImageTool struct {
	text   string
	images []string
}

func (f *fakeImageTool) Name() string            { return "shot" }
func (f *fakeImageTool) Description() string     { return "returns a screenshot" }
func (f *fakeImageTool) Schema() json.RawMessage { return json.RawMessage(`{"type":"object"}`) }
func (f *fakeImageTool) ReadOnly() bool          { return true }
func (f *fakeImageTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	text, _, err := f.ExecuteWithImages(ctx, args)
	return text, err
}
func (f *fakeImageTool) ExecuteWithImages(ctx context.Context, args json.RawMessage) (string, []string, error) {
	return f.text, f.images, nil
}

// Tool-result image bytes are preserved independently when text output is
// truncated. This prevents the textual head/tail splice from corrupting base64.
func TestToolResultImagesBypassTruncation(t *testing.T) {
	dataURL := "data:image/png;base64," + strings.Repeat("QUFB", 20000)
	longText := strings.Repeat("x", maxToolOutputBytes+1024) + "[image: image/png]"
	reg := tool.NewRegistry()
	reg.Add(&fakeImageTool{text: longText, images: []string{dataURL}})
	prov := &scriptedProvider{name: "p", turns: [][]provider.Chunk{
		{toolCallChunk("c1", "shot", `{}`), {Type: provider.ChunkDone}},
		{{Type: provider.ChunkText, Text: "done"}, {Type: provider.ChunkDone}},
	}}
	a := New(prov, reg, NewSession(""), Options{}, event.Discard)
	if err := a.Run(context.Background(), "take a screenshot"); err != nil {
		t.Fatalf("Run: %v", err)
	}
	var msg *provider.Message
	for i := range a.session.Messages {
		if a.session.Messages[i].Role == provider.RoleTool && a.session.Messages[i].Name == "shot" {
			msg = &a.session.Messages[i]
			break
		}
	}
	if msg == nil {
		t.Fatal("no tool message recorded for shot")
	}
	if len(msg.Images) != 1 || msg.Images[0] != dataURL {
		t.Fatalf("tool message images corrupted or missing: got %d images", len(msg.Images))
	}
	if len(msg.Content) > maxToolOutputBytes+1024 || !strings.Contains(msg.Content, "truncated") {
		t.Fatalf("tool text should be head+tail truncated, len=%d", len(msg.Content))
	}
	if strings.Contains(msg.Content, dataURL) {
		t.Fatal("image payload must not be embedded in the tool text")
	}
}
