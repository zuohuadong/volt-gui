package openai

import (
	"encoding/json"
	"strings"
	"testing"

	"voltui/internal/provider"
)

func TestBuildRequestEmbedsImagesForVisionModel(t *testing.T) {
	c := &client{model: "gpt-4o", vision: true}
	req := c.buildRequest(provider.Request{
		Messages: []provider.Message{
			{Role: provider.RoleUser, Content: "what is this", Images: []string{"data:image/png;base64,AAAA"}},
		},
	})
	parts, ok := req.Messages[0].Content.([]chatContentPart)
	if !ok {
		t.Fatalf("vision user content = %T, want []chatContentPart", req.Messages[0].Content)
	}
	if len(parts) != 2 || parts[0].Type != "text" || parts[1].Type != "image_url" {
		t.Fatalf("parts = %+v, want [text, image_url]", parts)
	}
	if parts[1].ImageURL == nil || parts[1].ImageURL.URL != "data:image/png;base64,AAAA" {
		t.Fatalf("image_url = %+v, want the data URL", parts[1].ImageURL)
	}
	body, _ := json.Marshal(req.Messages[0])
	if !strings.Contains(string(body), `"type":"image_url"`) {
		t.Errorf("serialized content missing image_url part: %s", body)
	}
}

func TestBuildRequestSkipsImagesWithoutVision(t *testing.T) {
	c := &client{model: "deepseek-v4"} // vision unset
	req := c.buildRequest(provider.Request{
		Messages: []provider.Message{
			{Role: provider.RoleUser, Content: "ignore the image", Images: []string{"data:image/png;base64,AAAA"}},
		},
	})
	if s, ok := req.Messages[0].Content.(string); !ok || s != "ignore the image" {
		t.Fatalf("non-vision content = %#v, want plain string", req.Messages[0].Content)
	}
}

func TestImageURLDetailFromConfig(t *testing.T) {
	c := &client{model: "gpt-4o", vision: true, visionDetail: "low"}
	req := c.buildRequest(provider.Request{
		Messages: []provider.Message{
			{Role: provider.RoleUser, Content: "x", Images: []string{"data:image/png;base64,AAAA"}},
		},
	})
	parts := req.Messages[0].Content.([]chatContentPart)
	if parts[1].ImageURL.Detail != "low" {
		t.Fatalf("detail = %q, want low", parts[1].ImageURL.Detail)
	}
}

func TestImageURLDetailOmittedByDefault(t *testing.T) {
	c := &client{model: "gpt-4o", vision: true}
	req := c.buildRequest(provider.Request{
		Messages: []provider.Message{
			{Role: provider.RoleUser, Content: "x", Images: []string{"data:image/png;base64,AAAA"}},
		},
	})
	body, _ := json.Marshal(req.Messages[0].Content.([]chatContentPart)[1])
	if strings.Contains(string(body), "detail") {
		t.Errorf("detail must be omitted when unset: %s", body)
	}
}

// Tool-result images cannot ride under role "tool" in Chat Completions. They
// are injected after the complete contiguous tool-result run so call pairing
// remains valid.
func TestBuildRequestInjectsToolImagesAsUserMessage(t *testing.T) {
	c := &client{model: "gpt-4o", vision: true}
	req := c.buildRequest(provider.Request{
		Messages: []provider.Message{
			{Role: provider.RoleUser, Content: "screenshot please"},
			{Role: provider.RoleAssistant, ToolCalls: []provider.ToolCall{
				{ID: "c1", Name: "shot", Arguments: "{}"},
				{ID: "c2", Name: "shot", Arguments: "{}"},
			}},
			{Role: provider.RoleTool, ToolCallID: "c1", Name: "shot", Content: "[image: image/png]", Images: []string{"data:image/png;base64,AAAA"}},
			{Role: provider.RoleTool, ToolCallID: "c2", Name: "shot", Content: "no image"},
			{Role: provider.RoleUser, Content: "and?"},
		},
	})
	if len(req.Messages) != 6 {
		t.Fatalf("got %d messages, want 6 (images injected after the tool run)", len(req.Messages))
	}
	for i, m := range req.Messages[2:4] {
		if _, ok := m.Content.(string); !ok || m.Role != "tool" {
			t.Fatalf("message %d = %+v, want tool message with plain string content", i+2, m)
		}
	}
	inj := req.Messages[4]
	if inj.Role != "user" {
		t.Fatalf("injected message role = %q, want user between tool run and next turn", inj.Role)
	}
	parts, ok := inj.Content.([]chatContentPart)
	if !ok || len(parts) != 2 || parts[0].Type != "text" || parts[1].Type != "image_url" {
		t.Fatalf("injected content = %#v, want [text, image_url]", inj.Content)
	}
	if parts[1].ImageURL == nil || parts[1].ImageURL.URL != "data:image/png;base64,AAAA" {
		t.Fatalf("image_url = %+v, want the tool image data URL", parts[1].ImageURL)
	}
	if req.Messages[5].Content != "and?" {
		t.Fatalf("trailing user message displaced: %+v", req.Messages[5])
	}
}

func TestBuildRequestFlushesTrailingToolImages(t *testing.T) {
	c := &client{model: "gpt-4o", vision: true}
	req := c.buildRequest(provider.Request{Messages: []provider.Message{
		{Role: provider.RoleUser, Content: "go"},
		{Role: provider.RoleAssistant, ToolCalls: []provider.ToolCall{{ID: "c1", Name: "shot", Arguments: "{}"}}},
		{Role: provider.RoleTool, ToolCallID: "c1", Name: "shot", Content: "[image: image/png]", Images: []string{"data:image/png;base64,AAAA"}},
	}})
	last := req.Messages[len(req.Messages)-1]
	if last.Role != "user" {
		t.Fatalf("last message = %+v, want the injected image user message", last)
	}
	if _, ok := last.Content.([]chatContentPart); !ok {
		t.Fatalf("last content = %#v, want content parts", last.Content)
	}
}

func TestBuildRequestSkipsToolImagesWithoutVision(t *testing.T) {
	c := &client{model: "deepseek-v4"}
	req := c.buildRequest(provider.Request{Messages: []provider.Message{
		{Role: provider.RoleUser, Content: "go"},
		{Role: provider.RoleAssistant, ToolCalls: []provider.ToolCall{{ID: "c1", Name: "shot", Arguments: "{}"}}},
		{Role: provider.RoleTool, ToolCallID: "c1", Name: "shot", Content: "[image: image/png]", Images: []string{"data:image/png;base64,AAAA"}},
	}})
	if len(req.Messages) != 3 {
		t.Fatalf("got %d messages, want 3 (no injection without vision)", len(req.Messages))
	}
	if s, ok := req.Messages[2].Content.(string); !ok || s != "[image: image/png]" {
		t.Fatalf("tool content = %#v, want the plain placeholder string", req.Messages[2].Content)
	}
}

// VoltUI supports the Responses surface as well as Chat Completions. Tool
// images must take the same structural image path instead of being silently
// discarded from function_call_output.
func TestBuildResponsesRequestInjectsToolImagesAfterOutputs(t *testing.T) {
	c := &client{model: "gpt-5.4", vision: true, apiSurface: apiSurfaceResponses}
	req := c.buildResponsesRequest(provider.Request{Messages: []provider.Message{
		{Role: provider.RoleUser, Content: "screenshot please"},
		{Role: provider.RoleAssistant, ToolCalls: []provider.ToolCall{
			{ID: "c1", Name: "shot", Arguments: "{}"},
			{ID: "c2", Name: "shot", Arguments: "{}"},
		}},
		{Role: provider.RoleTool, ToolCallID: "c1", Name: "shot", Content: "[image: image/png]", Images: []string{"data:image/png;base64,AAAA"}},
		{Role: provider.RoleTool, ToolCallID: "c2", Name: "shot", Content: "no image"},
		{Role: provider.RoleUser, Content: "and?"},
	}})
	if len(req.Input) != 7 {
		t.Fatalf("got %d input items, want 7 with injected tool image message", len(req.Input))
	}
	for i := 3; i <= 4; i++ {
		output, ok := req.Input[i].(responsesFunctionCallOutputItem)
		if !ok || output.Type != "function_call_output" || output.Output == "" {
			t.Fatalf("input %d = %#v, want text-only function_call_output", i, req.Input[i])
		}
	}
	injected, ok := req.Input[5].(responsesMessageItem)
	if !ok || injected.Role != "user" || len(injected.Content) != 2 {
		t.Fatalf("injected input = %#v, want user message with text and image", req.Input[5])
	}
	if injected.Content[0].Type != "input_text" || injected.Content[1].Type != "input_image" || injected.Content[1].ImageURL != "data:image/png;base64,AAAA" {
		t.Fatalf("injected content = %#v, want [input_text, input_image]", injected.Content)
	}
	trailing, ok := req.Input[6].(responsesMessageItem)
	if !ok || trailing.Role != "user" || len(trailing.Content) != 1 || trailing.Content[0].Text != "and?" {
		t.Fatalf("trailing input displaced: %#v", req.Input[6])
	}
}

func TestBuildResponsesRequestSkipsToolImagesWithoutVision(t *testing.T) {
	c := &client{model: "gpt-5.4", apiSurface: apiSurfaceResponses}
	req := c.buildResponsesRequest(provider.Request{Messages: []provider.Message{
		{Role: provider.RoleUser, Content: "go"},
		{Role: provider.RoleAssistant, ToolCalls: []provider.ToolCall{{ID: "c1", Name: "shot", Arguments: "{}"}}},
		{Role: provider.RoleTool, ToolCallID: "c1", Name: "shot", Content: "[image: image/png]", Images: []string{"data:image/png;base64,AAAA"}},
	}})
	if len(req.Input) != 3 {
		t.Fatalf("got %d input items, want no synthetic image message without vision", len(req.Input))
	}
	output, ok := req.Input[2].(responsesFunctionCallOutputItem)
	if !ok || output.Output != "[image: image/png]" {
		t.Fatalf("tool output = %#v, want the safe text placeholder", req.Input[2])
	}
}
