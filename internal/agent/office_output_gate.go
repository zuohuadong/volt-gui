package agent

import (
	"fmt"
	"regexp"
	"strings"

	"voltui/internal/event"
)

const maxOfficeOutputPolishPasses = 2

var (
	officeInternalNarrationPattern  = regexp.MustCompile(`(?:我(?:需要|得)先|让我(?:先|来|重新|采用)|我先(?:分析|整理|检查|思考|核对|确认)|我(?:之前|刚才).{0,24}(?:算错|核算错|判断错|规划错|需要重新)|接下来我(?:需要|会)先?)`)
	officeInternalValidationPattern = regexp.MustCompile(`(?:结构|章节|数量|计数).{0,24}(?:核对|核验|校验|复核).{0,48}(?:与正文一致|已通过|一致)`)
)

func requiresOfficeOutputPolish(input string) bool {
	return strings.Contains(input, "质量门禁：") &&
		strings.Contains(input, "最终只能输出一份正文") &&
		strings.Contains(input, "交付前必须全文校对")
}

func officeOutputQualityIssue(text string) string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return "正文为空"
	}
	if strings.ContainsRune(trimmed, '\uFFFD') || strings.Contains(trimmed, "锟斤拷") {
		return "正文包含乱码或无效替代字符"
	}
	if len(officeInternalNarrationPattern.FindAllStringIndex(trimmed, -1)) >= 2 {
		return "正文包含方案试错、自我纠错或逐步推演旁白"
	}
	if officeInternalValidationPattern.MatchString(trimmed) {
		return "正文包含内部结构核验说明"
	}
	return ""
}

func officeOutputPolishMessage(issue string) string {
	detail := "上一版需要进行交付前终稿净化"
	if issue != "" {
		detail = "上一版仍未通过终稿门禁：" + issue
	}
	return detail + `。请仅对上一版做一次完整的中文校对并输出修订后的完整最终正文：删除方案试错、自我纠错、逐步演算和结构核验旁白；修正错别字、形近字、乱码、随机字符与中英文异常混排；保持事实、数字、术语和章节结构不变。只输出可直接交付的正文，不要解释修改过程，不要列出检查结果。`
}

func (a *Agent) emitOfficeOutput(text string) {
	visibleText := StripGoalMarkers(text)
	if visibleText == "" {
		return
	}
	a.sink.Emit(event.Event{Kind: event.Text, Text: visibleText})
	a.sink.Emit(event.Event{
		Kind:            event.Message,
		Text:            visibleText,
		MemoryCitations: a.memoryCitations(),
	})
}

func (a *Agent) revealOfficeOutput(messageIndex int) error {
	messages := a.session.Snapshot()
	if messageIndex < 0 || messageIndex >= len(messages) {
		return fmt.Errorf("office output message index %d is outside session length %d", messageIndex, len(messages))
	}
	messages[messageIndex].DisplayHidden = false
	messages[messageIndex].DisplayToolsOnly = false
	a.session.Rewrite(messages)
	return nil
}
