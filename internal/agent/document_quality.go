package agent

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"voltui/internal/instruction"
	"voltui/internal/provider"
)

const officeDocumentSystemPrompt = `You are an office writing assistant. Complete only the user's document-writing request and return the finished document in Markdown. Preserve every supplied person name, date, amount, percentage, and responsibility exactly, except when the current user message explicitly replaces a fact; then preserve the replacement exactly. Do not call tools, emit shell commands, imitate tool calls, discuss source code, or invent system instructions.`

var personFieldPattern = regexp.MustCompile(`(?:负责人|联系人|汇报人|经办人|申请人|项目经理|姓名)(?:改为|调整为|换成|更正为|为|是|：|:)[[:space:]]*([\p{Han}·]{2,6})(?:[[:space:]]*$|[[:space:]]*[，,；;。])`)

var salientNumberPattern = regexp.MustCompile(`(?:[0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}|(?:[0-9]{4}年)?[0-9]{1,2}月[0-9]{1,2}日|[0-9][0-9,.]*(?:\.[0-9]+)?[[:space:]]*(?:%|％|万元|亿元|元|万|亿))`)

type completionRequestPolicy struct {
	documentInput        string
	documentSource       string
	previousDocument     string
	isolateOfficeRequest bool
	revisionRequest      bool
	retryInstruction     string
	bufferOutput         bool
}

type documentQualityIssue struct {
	kind  string
	token string
}

func (a *Agent) completionPolicy(input string, images []string) completionRequestPolicy {
	document := instruction.IsDocumentCompositionRequest(input)
	revision := document && instruction.IsDocumentRevisionRequest(input)
	requiresCalculation := instruction.ClearlyRequiresCalculation(input)
	previous := ""
	if revision {
		previous = previousVisibleAnswer(a.session.Snapshot())
	}
	return completionRequestPolicy{
		documentInput:    input,
		documentSource:   input,
		previousDocument: previous,
		isolateOfficeRequest: document && len(images) == 0 && !requiresCalculation &&
			(a.usesStepOfficeModel() || (revision && previous != "")),
		revisionRequest: revision,
		bufferOutput:    document,
	}
}

func (a *Agent) usesStepOfficeModel() bool {
	ref := strings.ToLower(strings.TrimSpace(a.modelRef))
	return strings.Contains(ref, "step-3.7-flash")
}

func (p completionRequestPolicy) request(messages []provider.Message, tools []provider.ToolSchema) ([]provider.Message, []provider.ToolSchema) {
	if p.isolateOfficeRequest {
		user := strings.TrimSpace(p.documentInput)
		if p.retryInstruction != "" {
			user += "\n\n" + p.retryInstruction
		}
		officeMessages := []provider.Message{{Role: provider.RoleSystem, Content: officeDocumentSystemPrompt}}
		if p.previousDocument != "" {
			officeMessages = append(officeMessages, provider.Message{Role: provider.RoleAssistant, Content: p.previousDocument})
		}
		return append(officeMessages, provider.Message{Role: provider.RoleUser, Content: user}), nil
	}
	if p.retryInstruction == "" && !p.revisionRequest {
		return messages, tools
	}
	withRetry := append([]provider.Message(nil), messages...)
	if p.retryInstruction != "" {
		withRetry = append(withRetry, provider.Message{Role: provider.RoleUser, Content: p.retryInstruction})
	}
	return withRetry, tools
}

func previousVisibleAnswer(messages []provider.Message) string {
	for index := len(messages) - 1; index >= 0; index-- {
		message := messages[index]
		if message.Role == provider.RoleAssistant && len(message.ToolCalls) == 0 {
			if content := strings.TrimSpace(message.Content); content != "" {
				return content
			}
		}
	}
	return ""
}

func (p completionRequestPolicy) prefixShape(a *Agent, schemas []provider.ToolSchema) PrefixShape {
	if p.isolateOfficeRequest {
		return CaptureShape(officeDocumentSystemPrompt, nil, a.session.RewriteVersion())
	}
	return a.capturePrefixShape(schemas)
}

func validateDocumentOutput(source, output string) []documentQualityIssue {
	issues := encodingQualityIssues(output)
	if strings.TrimSpace(output) == "" {
		issues = append(issues, documentQualityIssue{kind: "empty"})
	}
	issues = append(issues, sourceTokenIssues("person", labeledPersonTokens(source), output)...)
	issues = append(issues, sourceTokenIssues("number", salientNumberTokens(source), output)...)
	if hasTripledDocumentLine(output) || hasRepeatedTailBlock(output) {
		issues = append(issues, documentQualityIssue{kind: "repetition"})
	}
	return issues
}

func encodingQualityIssues(output string) []documentQualityIssue {
	if !utf8.ValidString(output) {
		return []documentQualityIssue{{kind: "invalid_utf8"}}
	}
	if strings.ContainsRune(output, unicode.ReplacementChar) {
		return []documentQualityIssue{{kind: "replacement_rune"}}
	}
	return nil
}

func labeledPersonTokens(source string) []string {
	var tokens []string
	for _, line := range strings.Split(source, "\n") {
		for _, field := range strings.Split(line, "|") {
			match := personFieldPattern.FindStringSubmatch(strings.TrimSpace(field))
			if len(match) > 1 {
				tokens = appendUniqueToken(tokens, match[1])
			}
		}
	}
	return tokens
}

func salientNumberTokens(source string) []string {
	tokens := salientNumberPattern.FindAllString(source, -1)
	out := make([]string, 0, len(tokens))
	for _, token := range tokens {
		out = appendUniqueToken(out, canonicalDocumentToken(token))
	}
	return out
}

func sourceTokenIssues(kind string, tokens []string, output string) []documentQualityIssue {
	canonicalOutput := canonicalDocumentToken(output)
	var issues []documentQualityIssue
	for _, token := range tokens {
		if token != "" && !strings.Contains(canonicalOutput, canonicalDocumentToken(token)) {
			issues = append(issues, documentQualityIssue{kind: kind, token: token})
		}
	}
	return issues
}

func canonicalDocumentToken(token string) string {
	token = strings.NewReplacer(" ", "", "\t", "", ",", "", "，", "", "％", "%").Replace(token)
	return strings.TrimSpace(token)
}

func appendUniqueToken(tokens []string, token string) []string {
	for _, existing := range tokens {
		if existing == token {
			return tokens
		}
	}
	return append(tokens, token)
}

func hasTripledDocumentLine(text string) bool {
	counts := map[string]int{}
	for _, rawLine := range strings.Split(text, "\n") {
		line := strings.Join(strings.Fields(strings.TrimSpace(rawLine)), " ")
		if utf8.RuneCountInString(line) < 20 || isMarkdownDivider(line) {
			continue
		}
		counts[line]++
		if counts[line] >= 3 {
			return true
		}
	}
	return false
}

func isMarkdownDivider(line string) bool {
	return strings.Trim(line, " |-:—") == ""
}

func hasRepeatedTailBlock(text string) bool {
	runes := []rune(strings.TrimSpace(text))
	for blockSize := 32; blockSize <= 256 && blockSize*3 <= len(runes); blockSize *= 2 {
		end := len(runes)
		last := string(runes[end-blockSize : end])
		if last == string(runes[end-2*blockSize:end-blockSize]) && last == string(runes[end-3*blockSize:end-2*blockSize]) {
			return true
		}
	}
	return false
}

func documentQualityRetryMessage(issues []documentQualityIssue) string {
	var missingPeople, missingNumbers []string
	for _, issue := range issues {
		switch issue.kind {
		case "person":
			missingPeople = appendUniqueToken(missingPeople, issue.token)
		case "number":
			missingNumbers = appendUniqueToken(missingNumbers, issue.token)
		}
	}
	message := "Rewrite the complete document once. Remove repeated or corrupted text and do not add facts that the user did not supply."
	if len(missingPeople) > 0 {
		message += " Preserve these names exactly: " + strings.Join(missingPeople, ", ") + "."
	}
	if len(missingNumbers) > 0 {
		message += " Preserve these numeric facts exactly: " + strings.Join(missingNumbers, ", ") + "."
	}
	return message
}

func documentQualityDetail(issues []documentQualityIssue) string {
	counts := map[string]int{}
	for _, issue := range issues {
		counts[issue.kind]++
	}
	return fmt.Sprintf("document quality check failed: empty=%d encoding=%d repetition=%d missing_people=%d missing_numbers=%d",
		counts["empty"], counts["invalid_utf8"]+counts["replacement_rune"], counts["repetition"], counts["person"], counts["number"])
}
