package agent

import (
	"context"
	"strings"
	"testing"

	"voltui/internal/agent/testutil"
	"voltui/internal/event"
	"voltui/internal/tool"
)

const testOfficeOutputContract = `质量门禁：
- 最终只能输出一份正文。
- 交付前必须全文校对。`

func TestOfficeOutputGateRequiresBoundedFinalProofread(t *testing.T) {
	prov := testutil.NewMock("office-output",
		testutil.Turn{Reasoning: "比较多个草案", Text: "结构计数核对一致：3 类指标 + 2 个问题 = 5 项，与正文一致。\n\n# 赤稿\n\n正式内容。"},
		testutil.Turn{Reasoning: "校对错别字", Text: "# 草稿\n\n正式内容。"},
	)
	var assistantEvents []event.Event
	a := New(prov, tool.NewRegistry(), NewSession("system"), Options{}, event.FuncSink(func(current event.Event) {
		if current.Kind == event.Text || current.Kind == event.Message || current.Kind == event.Reasoning {
			assistantEvents = append(assistantEvents, current)
		}
	}))

	if err := a.Run(context.Background(), testOfficeOutputContract); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if got := prov.CallCount(); got != 2 {
		t.Fatalf("provider calls = %d, want one draft plus one proofread", got)
	}
	requests := prov.Requests()
	if got := requests[1].Messages[len(requests[1].Messages)-1].Content; !strings.Contains(got, "终稿门禁") || !strings.Contains(got, "只输出可直接交付的正文") {
		t.Fatalf("proofread instruction missing: %q", got)
	}
	if got := a.session.Messages[len(a.session.Messages)-1].Content; got != "# 草稿\n\n正式内容。" {
		t.Fatalf("final assistant content = %q", got)
	}
	if len(assistantEvents) != 2 || assistantEvents[0].Kind != event.Text || assistantEvents[1].Kind != event.Message {
		t.Fatalf("assistant display events = %+v, want final text and message only", assistantEvents)
	}
	for _, current := range assistantEvents {
		if current.Text != "# 草稿\n\n正式内容。" || current.Reasoning != "" {
			t.Fatalf("assistant display leaked draft or reasoning: %+v", current)
		}
	}
}

func TestOfficeOutputGateRetriesInternalNarrationOnceMore(t *testing.T) {
	prov := testutil.NewMock("office-output",
		testutil.Turn{Text: "# 初稿\n\n正式内容。"},
		testutil.Turn{Text: "我之前核算错了，让我重新核算。让我采用最终方案。"},
		testutil.Turn{Text: "# 最终计划\n\n按四个里程碑执行。"},
	)
	a := New(prov, tool.NewRegistry(), NewSession("system"), Options{}, event.Discard)

	if err := a.Run(context.Background(), testOfficeOutputContract); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if got := prov.CallCount(); got != 3 {
		t.Fatalf("provider calls = %d, want bounded corrective retry", got)
	}
	if got := a.session.Messages[len(a.session.Messages)-1].Content; strings.Contains(got, "让我") {
		t.Fatalf("internal narration remained in final content: %q", got)
	}
}

func TestOfficeOutputGateDoesNotAffectOrdinaryPrompts(t *testing.T) {
	prov := testutil.NewMock("office-output", testutil.Turn{Text: "直接回答。"})
	a := New(prov, tool.NewRegistry(), NewSession("system"), Options{}, event.Discard)

	if err := a.Run(context.Background(), "请直接回答"); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if got := prov.CallCount(); got != 1 {
		t.Fatalf("provider calls = %d, want 1", got)
	}
}

func TestOfficeOutputQualityIssueDetectsInvalidChineseAndValidationAsides(t *testing.T) {
	for name, value := range map[string]string{
		"replacement character": "资料 A 与�资料 B",
		"mojibake":              "结果为锟斤拷",
		"validation aside":      "结构计数依据（核验已通过）：3 + 2 = 5，与正文一致。",
	} {
		t.Run(name, func(t *testing.T) {
			if got := officeOutputQualityIssue(value); got == "" {
				t.Fatalf("officeOutputQualityIssue(%q) did not report a problem", value)
			}
		})
	}
}
