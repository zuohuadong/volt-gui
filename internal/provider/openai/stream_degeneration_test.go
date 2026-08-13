package openai

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"voltui/internal/provider"
)

func TestReadStreamStopsRepeatedCJKAcrossFramesForEveryModel(t *testing.T) {
	stream := strings.Repeat("data: {\"choices\":[{\"delta\":{\"content\":\"推推推推\"}}]}\n\n", 12)
	stream += "data: [DONE]\n\n"
	for _, model := range []string{"known-model", "custom-model"} {
		t.Run(model, func(t *testing.T) {
			response := &http.Response{
				Header: http.Header{"X-Request-Id": []string{"request-repeat"}},
				Body:   io.NopCloser(strings.NewReader(stream)),
			}
			chunks := make(chan provider.Chunk, 64)
			emitted, err := (&client{name: "gateway", model: model}).readStream(context.Background(), response, chunks)
			var degeneration *provider.StreamDegenerationError
			if !errors.As(err, &degeneration) {
				t.Fatalf("readStream error = %T %v, want StreamDegenerationError", err, err)
			}
			if !emitted || degeneration.Signal != "repeated_cjk_rune" || degeneration.Count != repeatedCJKRuneLimit {
				t.Fatalf("degeneration = %+v emitted=%v", degeneration, emitted)
			}
			if strings.Contains(err.Error(), "推") {
				t.Fatalf("diagnostic leaked response content: %v", err)
			}
		})
	}
}

func TestStreamDegenerationGuardIgnoresCodeFencesAndTableRules(t *testing.T) {
	guard := streamDegenerationGuard{}
	text := "```text\n" + strings.Repeat("ab", 80) + "\n```\n" + strings.Repeat("|---", 80)
	if signal, count, stopped := guard.observe(text); stopped {
		t.Fatalf("ordinary code/table content stopped: signal=%s count=%d", signal, count)
	}
}

func TestStreamDegenerationGuardAllowsRepeatedLongTemplateBlock(t *testing.T) {
	guard := streamDegenerationGuard{}
	var paragraphs []string
	for index := 0; index < 40; index++ {
		paragraphs = append(paragraphs, fmt.Sprintf("项目章节%d包含执行计划、责任边界与验收标准。", index))
	}
	block := strings.Join(paragraphs, "\n")
	if _, _, stopped := guard.observe(block); stopped {
		t.Fatal("first document block stopped")
	}
	if signal, count, stopped := guard.observe(block); stopped {
		t.Fatalf("reused template block stopped: signal=%q count=%d", signal, count)
	}
}

func TestReadStreamStopsReasoningOnlyByteFloodWithoutLeakingText(t *testing.T) {
	reasoning := strings.Repeat("推理", reasoningOnlyByteLimit/6+100)
	stream := "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"" + reasoning + "\"}}]}\n\n"
	response := &http.Response{
		Header: http.Header{"X-Request-Id": []string{"request-reasoning-limit"}},
		Body:   io.NopCloser(strings.NewReader(stream)),
	}
	chunks := make(chan provider.Chunk, 8)
	_, err := (&client{name: "gateway", model: "step-3.7-flash"}).readStream(context.Background(), response, chunks)
	var limit *provider.ReasoningLimitError
	if !errors.As(err, &limit) || limit.Limit != "bytes" || limit.RequestID != "request-reasoning-limit" {
		t.Fatalf("readStream error = %T %+v, want byte ReasoningLimitError", err, err)
	}
	if strings.Contains(err.Error(), "推理") {
		t.Fatalf("diagnostic leaked reasoning text: %v", err)
	}
}

func TestReadStreamReasoningLimitAppliesToEveryModel(t *testing.T) {
	reasoning := strings.Repeat("analysis", reasoningOnlyByteLimit/8+1)
	stream := "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"" + reasoning + "\"}}]}\n\n"
	stream += "data: [DONE]\n\n"
	response := &http.Response{Body: io.NopCloser(strings.NewReader(stream))}
	chunks := make(chan provider.Chunk, 8)
	_, err := (&client{name: "custom", model: "custom-model"}).readStream(context.Background(), response, chunks)
	var limit *provider.ReasoningLimitError
	if !errors.As(err, &limit) || limit.Limit != "bytes" {
		t.Fatalf("custom model error = %T %+v, want byte ReasoningLimitError", err, err)
	}
}

func TestReasoningOnlyDurationLimitDoesNotApplyAfterVisibleText(t *testing.T) {
	streamContext := provider.StreamUTF8Context{Model: "step-3.7-flash", RequestID: "request-duration"}
	startedAt := time.Now().Add(-reasoningOnlyTimeLimit - time.Second)
	if err := reasoningOnlyLimitError(streamContext, startedAt, 128, true); err != nil {
		t.Fatalf("visible answer was stopped by reasoning-only limit: %v", err)
	}
	var limit *provider.ReasoningLimitError
	if err := reasoningOnlyLimitError(streamContext, startedAt, 128, false); !errors.As(err, &limit) || limit.Limit != "duration" {
		t.Fatalf("duration limit error = %T %+v", err, err)
	}
}

func TestReasoningOnlyByteLimitStaysDisabledAfterVisibleText(t *testing.T) {
	streamContext := provider.StreamUTF8Context{Model: "step-3.7-flash", RequestID: "request-interleaved"}
	startedAt := time.Now()
	if err := reasoningOnlyLimitError(streamContext, startedAt, reasoningOnlyByteLimit+1, true); err != nil {
		t.Fatalf("reasoning after visible text was stopped by reasoning-only byte limit: %v", err)
	}
}

func TestReadStreamCancelsReasoningOnlyStreamAtDurationLimit(t *testing.T) {
	reader, writer := io.Pipe()
	t.Cleanup(func() { _ = writer.Close() })
	response := &http.Response{
		Header: http.Header{"X-Request-Id": []string{"request-duration-watchdog"}},
		Body:   reader,
	}
	go func() {
		_, _ = io.WriteString(writer, "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"still thinking\"}}]}\n\n")
	}()
	chunks := make(chan provider.Chunk, 8)
	_, err := (&client{name: "gateway", model: "step-3.7-flash", reasoningTimeout: 20 * time.Millisecond}).readStream(context.Background(), response, chunks)
	var limit *provider.ReasoningLimitError
	if !errors.As(err, &limit) || limit.Limit != "duration" || limit.RequestID != "request-duration-watchdog" {
		t.Fatalf("readStream error = %T %+v, want duration ReasoningLimitError", err, err)
	}
}

func TestReadStreamDurationWatchdogDoesNotWinAfterAnswerStarts(t *testing.T) {
	reader, writer := io.Pipe()
	response := &http.Response{
		Header: http.Header{"X-Request-Id": []string{"request-answer-race"}},
		Body:   reader,
	}
	go func() {
		defer writer.Close()
		_, _ = io.WriteString(writer, "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"thinking\"}}]}\n\n")
		_, _ = io.WriteString(writer, "data: {\"choices\":[{\"delta\":{\"content\":\"answer\"}}]}\n\n")
		time.Sleep(30 * time.Millisecond)
		_, _ = io.WriteString(writer, "data: [DONE]\n\n")
	}()
	chunks := make(chan provider.Chunk, 8)
	if _, err := (&client{name: "gateway", model: "step-3.7-flash", reasoningTimeout: 20 * time.Millisecond}).readStream(context.Background(), response, chunks); err != nil {
		t.Fatalf("visible answer did not disable duration watchdog: %v", err)
	}
}

func TestReadStreamDurationWatchdogStopsAfterToolCallStarts(t *testing.T) {
	reader, writer := io.Pipe()
	response := &http.Response{
		Header: http.Header{"X-Request-Id": []string{"request-tool-race"}},
		Body:   reader,
	}
	go func() {
		defer writer.Close()
		_, _ = io.WriteString(writer, "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"thinking\"}}]}\n\n")
		_, _ = io.WriteString(writer, "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"name\":\"read_file\",\"arguments\":\"{}\"}}]}}]}\n\n")
		time.Sleep(30 * time.Millisecond)
		_, _ = io.WriteString(writer, "data: [DONE]\n\n")
	}()
	chunks := make(chan provider.Chunk, 8)
	if _, err := (&client{name: "gateway", model: "step-3.7-flash", reasoningTimeout: 20 * time.Millisecond}).readStream(context.Background(), response, chunks); err != nil {
		t.Fatalf("tool call did not disable reasoning-only watchdog: %v", err)
	}
}
