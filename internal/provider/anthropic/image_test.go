package anthropic

import (
	"encoding/json"
	"testing"

	"voltui/internal/provider"
)

func TestBuildRequestEmbedsImageBlockForVisionModel(t *testing.T) {
	c := &client{model: "claude-opus-4-8", vision: true}
	req := c.buildRequest(provider.Request{
		Messages: []provider.Message{
			{Role: provider.RoleUser, Content: "describe", Images: []string{"data:image/jpeg;base64,ZZZZ"}},
		},
	})
	blocks := req.Messages[0].Content
	if len(blocks) != 2 || blocks[0].Type != "text" || blocks[1].Type != "image" {
		t.Fatalf("blocks = %+v, want [text, image]", blocks)
	}
	src := blocks[1].Source
	if src == nil || src.Type != "base64" || src.MediaType != "image/jpeg" || src.Data != "ZZZZ" {
		t.Fatalf("image source = %+v, want base64 / image/jpeg / ZZZZ", src)
	}
}

func toolMessages(images []string) []provider.Message {
	return []provider.Message{
		{Role: provider.RoleUser, Content: "screenshot please"},
		{Role: provider.RoleAssistant, ToolCalls: []provider.ToolCall{{ID: "c1", Name: "shot", Arguments: "{}"}}},
		{Role: provider.RoleTool, ToolCallID: "c1", Name: "shot", Content: "[image: image/png]", Images: images},
	}
}

func TestBuildRequestEmbedsToolResultImagesForVisionModel(t *testing.T) {
	c := &client{model: "claude-opus-4-8", vision: true}
	req := c.buildRequest(provider.Request{Messages: toolMessages([]string{"data:image/png;base64,QUFB"})})
	last := req.Messages[len(req.Messages)-1]
	if last.Role != "user" || len(last.Content) != 1 || last.Content[0].Type != "tool_result" {
		t.Fatalf("last message = %+v, want a single tool_result block", last)
	}
	blocks, ok := last.Content[0].Content.([]contentBlock)
	if !ok {
		t.Fatalf("tool_result content = %T, want []contentBlock", last.Content[0].Content)
	}
	if len(blocks) != 2 || blocks[0].Type != "text" || blocks[1].Type != "image" {
		t.Fatalf("tool_result blocks = %+v, want [text, image]", blocks)
	}
	if blocks[0].Text != "[image: image/png]" {
		t.Fatalf("text block = %q, want the placeholder text", blocks[0].Text)
	}
	src := blocks[1].Source
	if src == nil || src.Type != "base64" || src.MediaType != "image/png" || src.Data != "QUFB" {
		t.Fatalf("image source = %+v, want base64 / image/png / QUFB", src)
	}
}

func TestBuildRequestDropsToolResultImagesWithoutVision(t *testing.T) {
	c := &client{model: "claude-opus-4-8"}
	req := c.buildRequest(provider.Request{Messages: toolMessages([]string{"data:image/png;base64,QUFB"})})
	last := req.Messages[len(req.Messages)-1]
	if s, ok := last.Content[0].Content.(string); !ok || s != "[image: image/png]" {
		t.Fatalf("non-vision tool_result content = %#v, want the plain placeholder string", last.Content[0].Content)
	}
}

// Text-only tool results preserve their historical string encoding rather than
// changing prompt-cache bytes merely because the model supports vision.
func TestBuildRequestToolResultTextOnlyKeepsStringContent(t *testing.T) {
	c := &client{model: "claude-opus-4-8", vision: true}
	msgs := toolMessages(nil)
	msgs[2].Content = "plain output"
	msgs = append(msgs, provider.Message{Role: provider.RoleUser, Content: "next"})
	req := c.buildRequest(provider.Request{Messages: msgs})
	last := req.Messages[len(req.Messages)-1]
	if len(last.Content) != 2 || last.Content[0].Type != "tool_result" {
		t.Fatalf("last message blocks = %+v, want [tool_result, text]", last.Content)
	}
	if s, ok := last.Content[0].Content.(string); !ok || s != "plain output" {
		t.Fatalf("tool_result content = %#v, want plain string", last.Content[0].Content)
	}
	body, err := json.Marshal(last.Content[0])
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	want := `{"type":"tool_result","tool_use_id":"c1","content":"plain output"}`
	if string(body) != want {
		t.Fatalf("serialized tool_result = %s, want %s", body, want)
	}
}

func TestBuildRequestSkipsImageBlockWithoutVision(t *testing.T) {
	c := &client{model: "claude-opus-4-8"} // vision unset
	req := c.buildRequest(provider.Request{
		Messages: []provider.Message{
			{Role: provider.RoleUser, Content: "describe", Images: []string{"data:image/jpeg;base64,ZZZZ"}},
		},
	})
	blocks := req.Messages[0].Content
	if len(blocks) != 1 || blocks[0].Type != "text" {
		t.Fatalf("blocks = %+v, want [text] only when vision is off", blocks)
	}
}
