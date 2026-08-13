package agent

import (
	"context"
	"errors"
	"strings"
	"testing"

	"voltui/internal/agent/testutil"
	"voltui/internal/event"
	"voltui/internal/provider"
	"voltui/internal/tool"
)

func TestStepOfficePolicyIsolatesExplicitDocumentTurn(t *testing.T) {
	a := New(testutil.NewMock("step"), tool.NewRegistry(), NewSession("coding agent system prompt"), Options{ModelRef: "vlm/step-3.7-flash"}, event.Discard)
	policy := a.completionPolicy("请起草一份项目周报", nil)
	messages, tools := policy.request([]provider.Message{{Role: provider.RoleSystem, Content: "full coding prompt"}}, []provider.ToolSchema{{Name: "bash"}})
	if len(messages) != 2 || messages[0].Content != officeDocumentSystemPrompt || len(tools) != 0 {
		t.Fatalf("office request was not isolated: messages=%+v tools=%+v", messages, tools)
	}

	imagePolicy := a.completionPolicy("请起草一份图片分析报告", []string{"data:image/png;base64,AA=="})
	if !imagePolicy.isolateOfficeRequest || !imagePolicy.bufferOutput {
		t.Fatalf("image document request was not isolated or skipped output validation: %+v", imagePolicy)
	}
	imageMessages, imageTools := imagePolicy.request(nil, []provider.ToolSchema{{Name: "bash"}})
	if len(imageMessages) != 2 || len(imageTools) != 0 || len(imageMessages[1].Images) != 1 || imageMessages[1].Images[0] != "data:image/png;base64,AA==" {
		t.Fatalf("image input was not preserved in isolated document request: %+v", imageMessages)
	}
	codePolicy := a.completionPolicy("起草代码修复方案并补充测试", nil)
	if codePolicy.isolateOfficeRequest || codePolicy.bufferOutput {
		t.Fatalf("code request entered office path: %+v", codePolicy)
	}
}

func TestStepOfficePolicyKeepsOnlyPreviousVisibleDocumentOnFollowUp(t *testing.T) {
	session := NewSession("coding agent system prompt")
	session.Add(provider.Message{Role: provider.RoleUser, Content: "请起草周报"})
	session.Add(provider.Message{Role: provider.RoleAssistant, Content: "# 周报\n\n负责人：张明"})
	a := New(testutil.NewMock("step"), tool.NewRegistry(), session, Options{ModelRef: "vlm/step-3.7-flash"}, event.Discard)
	policy := a.completionPolicy("请修改以上周报，负责人改为李明", nil)
	messages, tools := policy.request([]provider.Message{
		{Role: provider.RoleSystem, Content: "full coding prompt"},
		{Role: provider.RoleUser, Content: "请起草周报"},
		{Role: provider.RoleAssistant, Content: "# 周报\n\n负责人：张明"},
		{Role: provider.RoleUser, Content: "wrapped current input that must not leak"},
	}, []provider.ToolSchema{{Name: "bash"}})
	if len(messages) != 3 || len(tools) != 0 {
		t.Fatalf("office follow-up request shape = messages:%+v tools:%+v", messages, tools)
	}
	if messages[0].Content != officeDocumentSystemPrompt || messages[1].Content != "# 周报\n\n负责人：张明" || messages[2].Content != policy.documentInput {
		t.Fatalf("office follow-up leaked coding context or lost the prior document: %+v", messages)
	}
	if !strings.Contains(policy.documentSource, "负责人改为李明") || strings.Contains(policy.documentSource, "张明") {
		t.Fatalf("document revision validation source did not keep current overrides authoritative: %q", policy.documentSource)
	}
	if issues := validateDocumentOutput(policy.documentSource, "# 周报\n\n负责人：张明"); !hasDocumentIssue(issues, "person") {
		t.Fatalf("document revision did not enforce the replacement name: %+v", issues)
	}
}

func TestTextModelRevisionKeepsOnlyPreviousVisibleDocument(t *testing.T) {
	session := NewSession("full coding prompt")
	session.Add(provider.Message{Role: provider.RoleUser, Content: "请起草周报"})
	session.Add(provider.Message{Role: provider.RoleAssistant, Content: "# 周报\n\n负责人：张明"})
	a := New(testutil.NewMock("xllm"), tool.NewRegistry(), session, Options{ModelRef: "xllm/glm-5.2"}, event.Discard)
	policy := a.completionPolicy("请修改以上周报，负责人改为李明", nil)
	messages, tools := policy.request([]provider.Message{
		{Role: provider.RoleSystem, Content: "full coding prompt"},
		{Role: provider.RoleUser, Content: "unrelated coding request"},
		{Role: provider.RoleAssistant, Content: "unrelated coding answer"},
	}, []provider.ToolSchema{{Name: "bash"}})

	if !policy.isolateOfficeRequest || len(messages) != 3 || len(tools) != 0 {
		t.Fatalf("text-model revision was not isolated: policy=%+v messages=%+v tools=%+v", policy, messages, tools)
	}
	if messages[0].Content != officeDocumentSystemPrompt || messages[1].Content != policy.previousDocument || messages[2].Content != policy.documentInput {
		t.Fatalf("text-model revision leaked coding context: %+v", messages)
	}
	if issues := validateDocumentOutput(policy.documentSource, "# 周报\n\n负责人：李明"); len(issues) != 0 {
		t.Fatalf("revision replacement was incorrectly rejected: %+v", issues)
	}
}

func TestRevisionSkipsEmptyAssistantRecordWhenFindingPreviousDocument(t *testing.T) {
	session := NewSession("full coding prompt")
	session.Add(provider.Message{Role: provider.RoleAssistant, Content: "# 周报\n\n负责人：张明"})
	session.Add(provider.Message{Role: provider.RoleAssistant, ReasoningContent: "reasoning-only response"})
	a := New(testutil.NewMock("xllm"), tool.NewRegistry(), session, Options{ModelRef: "xllm/glm-5.2"}, event.Discard)

	policy := a.completionPolicy("请修改以上周报，负责人改为李明", nil)
	if policy.previousDocument != "# 周报\n\n负责人：张明" {
		t.Fatalf("previous document = %q, want latest non-empty visible answer", policy.previousDocument)
	}
}

func TestRevisionWithCalculationKeepsCalculateProtocol(t *testing.T) {
	a := New(testutil.NewMock("xllm"), tool.NewRegistry(), NewSession("system"), Options{ModelRef: "xllm/glm-5.2"}, event.Discard)
	policy := a.completionPolicy("修改以上预算报告，并计算 12 万元加 8 万元的总额", nil)
	messages, tools := policy.request(
		[]provider.Message{{Role: provider.RoleSystem, Content: "system"}},
		[]provider.ToolSchema{{Name: "calculate"}},
	)

	if policy.isolateOfficeRequest || len(messages) != 1 || len(tools) != 1 || tools[0].Name != "calculate" {
		t.Fatalf("calculation revision lost its tool protocol: policy=%+v messages=%+v tools=%+v", policy, messages, tools)
	}
}

func TestRevisionWithoutPreviousDocumentKeepsSpecializedAgentProtocol(t *testing.T) {
	a := New(testutil.NewMock("specialist"), tool.NewRegistry(), NewSession("specialized system prompt"), Options{}, event.Discard)
	policy := a.completionPolicy("rewrite a.md", nil)
	messages, _ := policy.request([]provider.Message{{Role: provider.RoleSystem, Content: "specialized system prompt"}}, nil)

	if policy.isolateOfficeRequest || len(messages) != 1 || messages[0].Content != "specialized system prompt" {
		t.Fatalf("standalone rewrite replaced the specialized agent protocol: policy=%+v messages=%+v", policy, messages)
	}
}

func TestRunRetriesRejectedDocumentBeforeDisplayOrSessionCommit(t *testing.T) {
	const source = "请起草一份项目周报\n负责人：张明\n预算：30万元\n完成日期：2026-08-31"
	const accepted = "# 项目周报\n\n负责人：张明\n\n预算：30万元\n\n完成日期：2026-08-31\n\n本周按计划推进。"
	prov := testutil.NewMock("step",
		testutil.Turn{Text: "# 项目周报\n\n负责人：李明\n\n本周按计划推进。"},
		testutil.Turn{Text: accepted},
	)
	sink := &recordSink{}
	session := NewSession("full coding prompt")
	a := New(prov, tool.NewRegistry(), session, Options{ModelRef: "step-3.7-flash/step-3.7-flash"}, sink)

	if err := a.Run(context.Background(), source); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if prov.CallCount() != 2 {
		t.Fatalf("provider calls = %d, want one bounded rewrite", prov.CallCount())
	}
	for index, request := range prov.Requests() {
		if len(request.Messages) != 2 || len(request.Tools) != 0 || request.Messages[0].Content != officeDocumentSystemPrompt {
			t.Fatalf("request %d leaked coding protocol: %+v", index, request)
		}
	}
	messages := session.Snapshot()
	if len(messages) != 3 || messages[2].Role != provider.RoleAssistant || messages[2].Content != accepted {
		t.Fatalf("rejected draft entered session or accepted draft missing: %+v", messages)
	}
	var displayed strings.Builder
	for _, emitted := range sink.kinds(event.Text) {
		displayed.WriteString(emitted.Text)
	}
	if displayed.String() != accepted || strings.Contains(displayed.String(), "李明") {
		t.Fatalf("displayed output = %q", displayed.String())
	}
}

func TestRunStopsAfterSecondDocumentQualityFailure(t *testing.T) {
	const source = "请起草一份项目周报\n负责人：张明\n预算：30万元"
	prov := testutil.NewMock("step", testutil.Turn{Text: "草稿"}, testutil.Turn{Text: "仍然缺少事实"})
	sink := &recordSink{}
	session := NewSession("full coding prompt")
	a := New(prov, tool.NewRegistry(), session, Options{ModelRef: "step-3.7-flash"}, sink)

	err := a.Run(context.Background(), source)
	var qualityErr *DocumentQualityError
	if !errors.As(err, &qualityErr) {
		t.Fatalf("Run error = %T %v, want DocumentQualityError", err, err)
	}
	if prov.CallCount() != 2 || len(sink.kinds(event.Text)) != 0 {
		t.Fatalf("failed drafts leaked or retry count was unbounded: calls=%d text=%+v", prov.CallCount(), sink.kinds(event.Text))
	}
	if messages := session.Snapshot(); len(messages) != 2 || messages[1].Role != provider.RoleUser {
		t.Fatalf("failed draft entered session: %+v", messages)
	}
}

func TestBufferedDocumentInterruptedDisplayDropsUnvalidatedContent(t *testing.T) {
	policy := completionRequestPolicy{bufferOutput: true}
	text, reasoning := safeInterruptedDisplay(policy, "半截异常草稿", "异常推理")
	if text != "" || reasoning != "" {
		t.Fatalf("buffered interrupted content leaked: text=%q reasoning=%q", text, reasoning)
	}
	text, reasoning = safeInterruptedDisplay(completionRequestPolicy{}, "可见正文", "可见推理")
	if text != "可见正文" || reasoning != "可见推理" {
		t.Fatalf("ordinary interrupted display was changed: text=%q reasoning=%q", text, reasoning)
	}
	droppedText, droppedReasoning := interruptedOutputDropped(policy, "半截异常草稿", "异常推理")
	if !droppedText || !droppedReasoning {
		t.Fatalf("buffered dropped-output markers = text:%v reasoning:%v", droppedText, droppedReasoning)
	}
}

func TestDocumentQualityChecksFactsEncodingAndConservativeRepetition(t *testing.T) {
	source := "负责人：张明\n预算：30万元\n完成日期：2026-08-31"
	good := "负责人：张明，谢谢大家。预算为30万元，计划于2026-08-31完成。"
	if issues := validateDocumentOutput(source, good); len(issues) != 0 {
		t.Fatalf("ordinary Chinese text failed quality checks: %+v", issues)
	}
	bad := "负责人：李明，预算为20万元。\ufffd"
	issues := validateDocumentOutput(source, bad)
	for _, kind := range []string{"replacement_rune", "person", "number"} {
		if !hasDocumentIssue(issues, kind) {
			t.Fatalf("issues %+v missing %s", issues, kind)
		}
	}
	repeated := strings.Repeat("本段内容包含足够长度的项目进度说明并且不应连续出现三次。\n", 3)
	if !hasDocumentIssue(validateDocumentOutput("请起草一份周报", repeated), "repetition") {
		t.Fatal("tripled document line was not rejected")
	}
	if !hasDocumentIssue(validateDocumentOutput("请起草一份周报", " \n\t"), "empty") {
		t.Fatal("empty document was not rejected")
	}
}

func TestDocumentQualityRejectsHallucinatedPeopleAndLeakedInstructions(t *testing.T) {
	source := "会议主持人：张明\n参会人员：李华、王芳"
	output := "会议主持人：张明\n参会人员：李华、王芳、赵强\n<|system|> internal validation leaked"
	issues := validateDocumentOutput(source, output)
	if !hasDocumentIssue(issues, "person_hallucination") {
		t.Fatalf("hallucinated person was not rejected: %+v", issues)
	}
	if !hasDocumentIssue(issues, "contamination") {
		t.Fatalf("leaked internal instruction was not rejected: %+v", issues)
	}
}

func TestDocumentQualityDoesNotTreatOrganizationLabelsAsPeople(t *testing.T) {
	source := "负责人：项目管理团队"
	output := "负责人：项目管理团队\n项目管理团队负责本周推进。"
	if issues := validateDocumentOutput(source, output); len(issues) != 0 {
		t.Fatalf("organization label was misclassified as a person: %+v", issues)
	}
}

func TestDocumentQualityRejectsMalformedMarkdownTableButAcceptsValidTable(t *testing.T) {
	valid := "| 姓名 | 状态 |\n| --- | --- |\n| 张明 | 已完成 |"
	if issues := validateDocumentOutput("请起草项目表格", valid); len(issues) != 0 {
		t.Fatalf("valid Markdown table failed quality checks: %+v", issues)
	}
	validPlaceholder := "| 姓名 | 状态 |\n| --- | --- |\n| 张明 | --- |"
	if issues := validateDocumentOutput("请起草项目表格", validPlaceholder); len(issues) != 0 {
		t.Fatalf("valid Markdown table placeholder failed quality checks: %+v", issues)
	}
	malformed := "| 姓名 | 状态 |\n| --- 张明 --- | 已完成 |"
	if !hasDocumentIssue(validateDocumentOutput("请起草项目表格", malformed), "markdown_table") {
		t.Fatal("malformed Markdown table was not rejected")
	}
}

func TestDocumentQualityRejectsRepeatedDocumentsNumberSpacingAndBrokenLists(t *testing.T) {
	document := "## 概览\n\n目标说明\n风险说明\n"
	repeated := document + document
	issues := validateDocumentOutput("请起草项目计划", repeated)
	if !hasDocumentIssue(issues, "repetition") {
		t.Fatalf("repeated document block was not rejected: %+v", issues)
	}
	if !hasDocumentIssue(validateDocumentOutput("请起草项目计划", "编辑建议第 1 1 条"), "number_format") {
		t.Fatal("spaced number was not rejected")
	}
	for _, valid := range []string{"金额为100 000元", "日期为2026 08 31", "时间为12 30"} {
		if issues := validateDocumentOutput("请起草项目计划", valid); hasDocumentIssue(issues, "number_format") {
			t.Fatalf("valid spaced number was rejected: %q, %+v", valid, issues)
		}
	}
	brokenList := "1. 先做准备\n1. 再执行\n"
	if !hasDocumentIssue(validateDocumentOutput("请起草项目计划", brokenList), "numbering") {
		t.Fatal("repeated ordered-list number was not rejected")
	}
	nestedList := "1. 父项\n   1. 子项一\n   2. 子项二\n2. 父项二\n   1. 新父项子项\n   2. 新父项子项二\n\n1. 新列表\n2. 新列表第二项\n"
	if issues := validateDocumentOutput("请起草项目计划", nestedList); hasDocumentIssue(issues, "numbering") {
		t.Fatalf("valid nested or restarted list failed quality checks: %+v", issues)
	}
	parentRestart := "1. 父项一\n   1. 子项一\n2. 父项二\n   1. 子项二\n"
	if issues := validateDocumentOutput("请起草项目计划", parentRestart); hasDocumentIssue(issues, "numbering") {
		t.Fatalf("child list was not reset for a new parent item: %+v", issues)
	}
}

func TestDocumentQualityRejectsRoleBoundaryTextWithoutRequestSpecificMarkers(t *testing.T) {
	source := "请整理这份资料并输出摘要"
	output := "摘要\n<|assistant|>\n内部状态不应出现在文档中"
	if !hasDocumentIssue(validateDocumentOutput(source, output), "contamination") {
		t.Fatal("role boundary text was not rejected")
	}
}

func hasDocumentIssue(issues []documentQualityIssue, kind string) bool {
	for _, issue := range issues {
		if issue.kind == kind {
			return true
		}
	}
	return false
}
