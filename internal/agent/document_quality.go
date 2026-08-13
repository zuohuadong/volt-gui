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
	images               []string
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
		documentInput:        input,
		documentSource:       input,
		images:               append([]string(nil), images...),
		previousDocument:     previous,
		isolateOfficeRequest: document && !requiresCalculation && (!revision || previous != ""),
		revisionRequest:      revision,
		bufferOutput:         document,
	}
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
		return append(officeMessages, provider.Message{Role: provider.RoleUser, Content: user, Images: p.images}), nil
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
	issues = append(issues, hallucinatedPersonIssues(source, output)...)
	issues = append(issues, sourceTokenIssues("number", salientNumberTokens(source), output)...)
	if hasTripledDocumentLine(output) || hasRepeatedTailBlock(output) || hasRepeatedDocumentBlock(output) || hasRepeatedPhrase(output) {
		issues = append(issues, documentQualityIssue{kind: "repetition"})
	}
	if hasSuspiciousNumberSpacing(output) {
		issues = append(issues, documentQualityIssue{kind: "number_format"})
	}
	if hasBrokenOrderedList(output) {
		issues = append(issues, documentQualityIssue{kind: "numbering"})
	}
	if hasMalformedMarkdownTable(output) {
		issues = append(issues, documentQualityIssue{kind: "markdown_table"})
	}
	if reason := documentOutputContaminationReason(source, output); reason != "" {
		issues = append(issues, documentQualityIssue{kind: "contamination", token: reason})
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
			for _, person := range personNamesAfterLabel(strings.TrimSpace(field)) {
				tokens = appendUniqueToken(tokens, person)
			}
		}
	}
	return tokens
}

var personLabelPattern = regexp.MustCompile(`(?:负责人|联系人|汇报人|经办人|申请人|项目经理|主持人|跟进人|参会(?:人员|人)|参与人|成员|姓名)`)
var personNamePattern = regexp.MustCompile(`^[\p{Han}·]{2,6}$`)
var organizationNameSuffixPattern = regexp.MustCompile(`(?:团队|部门|公司|中心|委员会|小组|项目组|办公室|学院|学校|机构)$`)

func personNamesAfterLabel(line string) []string {
	match := personLabelPattern.FindStringIndex(line)
	if match == nil {
		return nil
	}
	label := line[match[0]:match[1]]
	tail := line[match[1]:]
	if tail == "" || !strings.ContainsRune(" ：:\t", []rune(tail)[0]) {
		return nil
	}
	if next := strings.IndexAny(tail, "。；;\n"); next >= 0 {
		tail = tail[:next]
	}
	var names []string
	allowMultiple := strings.Contains(label, "参会") || strings.Contains(label, "参与") || label == "成员"
	for _, candidate := range strings.FieldsFunc(tail, func(r rune) bool {
		return strings.ContainsRune(" ：:、,，/\\|和及与\t", r)
	}) {
		candidate = strings.TrimSpace(candidate)
		if personNamePattern.MatchString(candidate) && !organizationNameSuffixPattern.MatchString(candidate) {
			names = appendUniqueToken(names, candidate)
			if !allowMultiple {
				break
			}
		}
	}
	return names
}

func hallucinatedPersonIssues(source, output string) []documentQualityIssue {
	allowed := make(map[string]struct{})
	for _, person := range labeledPersonTokens(source) {
		allowed[person] = struct{}{}
	}
	if len(allowed) == 0 {
		return nil
	}
	var issues []documentQualityIssue
	for _, person := range labeledPersonTokens(output) {
		if _, ok := allowed[person]; !ok {
			issues = append(issues, documentQualityIssue{kind: "person_hallucination", token: person})
		}
	}
	return issues
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

func hasRepeatedDocumentBlock(text string) bool {
	lines := nonEmptyDocumentLines(text)
	if len(lines) < 4 || len(lines)%2 != 0 {
		return false
	}
	midpoint := len(lines) / 2
	for index := 0; index < midpoint; index++ {
		if lines[index] != lines[midpoint+index] {
			return false
		}
	}
	return true
}

func nonEmptyDocumentLines(text string) []string {
	lines := make([]string, 0)
	for _, rawLine := range strings.Split(text, "\n") {
		line := strings.TrimSpace(rawLine)
		if line != "" {
			lines = append(lines, line)
		}
	}
	return lines
}

var spacedNumberPattern = regexp.MustCompile(`[0-9]+(?:[ \t]+[0-9]+)+`)
var orderedListPattern = regexp.MustCompile(`^\s*([0-9]+)[.)、]\s+`)
var roleBoundaryPattern = regexp.MustCompile(`(?i)<\|(?:system|user|assistant)\|>`)

type orderedListState struct {
	previous     int
	seen         map[int]struct{}
	parentIndent int
	parentNumber int
}

func hasSuspiciousNumberSpacing(text string) bool {
	for _, run := range spacedNumberPattern.FindAllString(text, -1) {
		parts := strings.Fields(run)
		if len(parts) < 2 || validSpacedNumber(parts) {
			continue
		}
		for _, part := range parts {
			if len(part) == 1 {
				return true
			}
		}
	}
	return false
}

func validSpacedNumber(parts []string) bool {
	if len(parts) > 1 && len(parts[0]) >= 1 && len(parts[0]) <= 3 {
		grouped := true
		for _, part := range parts[1:] {
			if len(part) != 3 {
				grouped = false
				break
			}
		}
		if grouped {
			return true
		}
	}
	if len(parts) >= 2 && len(parts[0]) == 4 && len(parts) <= 3 {
		for _, part := range parts[1:] {
			if len(part) < 1 || len(part) > 2 {
				return false
			}
		}
		return true
	}
	return len(parts) == 2 && len(parts[0]) == 2 && len(parts[1]) == 2
}

func hasRepeatedPhrase(text string) bool {
	runes := []rune(strings.TrimSpace(text))
	for phraseSize := 1; phraseSize <= 16; phraseSize++ {
		for start := 0; start+phraseSize*8 <= len(runes); start++ {
			phrase := runes[start : start+phraseSize]
			if !containsLetter(phrase) {
				continue
			}
			repeated := true
			for offset := phraseSize; offset < phraseSize*8; offset++ {
				if runes[start+offset] != phrase[offset%phraseSize] {
					repeated = false
					break
				}
			}
			if repeated {
				return true
			}
		}
	}
	return false
}

func containsLetter(runes []rune) bool {
	for _, currentRune := range runes {
		if unicode.IsLetter(currentRune) {
			return true
		}
	}
	return false
}

func hasBrokenOrderedList(text string) bool {
	states := make(map[int]orderedListState)
	for _, rawLine := range strings.Split(text, "\n") {
		match := orderedListPattern.FindStringSubmatch(rawLine)
		if len(match) == 0 {
			states = make(map[int]orderedListState)
			continue
		}
		indent := len(rawLine) - len(strings.TrimLeft(rawLine, " \t"))
		resetNestedListStates(states, indent)
		parentIndent, parentNumber := nearestParentList(states, indent)
		number := 0
		for _, digit := range match[1] {
			number = number*10 + int(digit-'0')
		}
		state, exists := states[indent]
		if !exists || state.parentIndent != parentIndent || state.parentNumber != parentNumber {
			state = orderedListState{seen: make(map[int]struct{}), parentIndent: parentIndent, parentNumber: parentNumber}
		}
		if _, duplicate := state.seen[number]; duplicate {
			return true
		}
		if state.previous > 0 && number > 1 && number != state.previous+1 {
			return true
		}
		state.seen[number] = struct{}{}
		state.previous = number
		states[indent] = state
	}
	return false
}

func nearestParentList(states map[int]orderedListState, indent int) (int, int) {
	parentIndent := -1
	parentNumber := 0
	for candidateIndent, candidate := range states {
		if candidateIndent < indent && candidateIndent > parentIndent {
			parentIndent = candidateIndent
			parentNumber = candidate.previous
		}
	}
	return parentIndent, parentNumber
}

func resetNestedListStates(states map[int]orderedListState, indent int) {
	for previousIndent := range states {
		if previousIndent > indent {
			delete(states, previousIndent)
		}
	}
}

func hasMalformedMarkdownTable(text string) bool {
	lines := strings.Split(text, "\n")
	for index := 0; index+1 < len(lines); index++ {
		header := strings.TrimSpace(lines[index])
		separator := strings.TrimSpace(lines[index+1])
		if !strings.Contains(header, "|") || !strings.Contains(separator, "|") || !strings.Contains(separator, "---") {
			continue
		}
		if isMarkdownDivider(header) {
			continue
		}
		if !isMarkdownDivider(separator) {
			return true
		}
	}
	return false
}

func documentOutputContaminationReason(source, text string) string {
	if roleBoundaryPattern.MatchString(text) && !roleBoundaryPattern.MatchString(source) {
		return "role_boundary"
	}
	return ""
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
	message := "Rewrite the complete document once. Remove repeated, corrupted, malformed, or leaked internal text and do not add facts that the user did not supply."
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
	return fmt.Sprintf("document quality check failed: empty=%d encoding=%d repetition=%d number_format=%d numbering=%d markdown_table=%d contamination=%d missing_people=%d hallucinated_people=%d missing_numbers=%d",
		counts["empty"], counts["invalid_utf8"]+counts["replacement_rune"], counts["repetition"], counts["number_format"], counts["numbering"], counts["markdown_table"], counts["contamination"], counts["person"], counts["person_hallucination"], counts["number"])
}
