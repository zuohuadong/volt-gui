package main

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// localTurnRecorder is intentionally narrower than control.SessionAPI so this
// desktop-only route cannot change the shared controller contract for other
// transports.
type localTurnRecorder interface {
	RecordLocalTurn(input, response string) error
}

// submitTodayAgendaIfMatched handles a deliberately narrow local-query shape.
// It is called after a tab's controller is ready, before normal model submit.
func (a *App) submitTodayAgendaIfMatched(tab *WorkspaceTab, ctrl any, display, input string) (bool, error) {
	query := strings.TrimSpace(display)
	if query == "" {
		query = strings.TrimSpace(input)
	}
	if !isTodayAgendaQuery(display, input) {
		return false, nil
	}
	recorder, ok := ctrl.(localTurnRecorder)
	if !ok {
		return true, fmt.Errorf("当前会话不支持本地日程查询")
	}

	reply := a.todayAgendaReply(time.Now())
	a.ensureTabTopicIndexedForUserTurn(tab)
	return true, recorder.RecordLocalTurn(query, reply)
}

// isTodayAgendaQuery accepts only Chinese requests clearly asking for today's
// calendar or todos. Explicit file/code intent always stays on the normal agent
// path so this guard cannot hijack workspace-oriented conversations.
func isTodayAgendaQuery(display string, inputs ...string) bool {
	query := strings.TrimSpace(strings.ToLower(display))
	if query == "" && len(inputs) > 0 {
		query = strings.TrimSpace(strings.ToLower(inputs[0]))
	}
	if query == "" {
		return false
	}
	for _, input := range append([]string{display}, inputs...) {
		if hasExplicitWorkspaceIntent(input) || hasAgendaMutationIntent(input) {
			return false
		}
	}
	if !strings.Contains(query, "今天") && !strings.Contains(query, "今日") {
		return false
	}
	for _, marker := range []string{
		"安排", "日程", "行程", "待办", "任务", "会议", "计划", "有什么", "有啥", "哪些事", "什么事", "做什么", "干什么",
	} {
		if strings.Contains(query, marker) {
			return true
		}
	}
	return false
}

// hasAgendaMutationIntent keeps this fast path strictly read-only. Calendar
// and todo writes must stay on the normal agent route, even when the compact
// display text looks like an agenda question.
func hasAgendaMutationIntent(input string) bool {
	query := strings.TrimSpace(strings.ToLower(input))
	for _, marker := range []string{
		"帮我安排", "安排一下", "安排今天", "安排会议", "安排日程", "安排待办",
		"新建", "创建", "添加", "修改", "取消", "删除", "编辑", "更新", "调整", "设置", "提醒我",
		"create ", "add ", "update ", "cancel ", "delete ",
	} {
		if strings.Contains(query, marker) {
			return true
		}
	}
	return false
}

func hasExplicitWorkspaceIntent(input string) bool {
	query := strings.TrimSpace(strings.ToLower(input))
	if query == "" {
		return false
	}
	if strings.HasPrefix(query, "/") || strings.HasPrefix(query, "./") || strings.HasPrefix(query, "../") || strings.Contains(query, "@") || strings.Contains(query, "\\") || containsWorkspacePathToken(query) {
		return true
	}
	for _, marker := range []string{
		"文件", "代码", "目录", "工作区", "仓库", "路径", "repo", "file", "path", "read_file", "list_dir", "glob", "grep", "搜索文件",
	} {
		if strings.Contains(query, marker) {
			return true
		}
	}
	return false
}

func containsWorkspacePathToken(query string) bool {
	for _, token := range strings.FieldsFunc(query, func(r rune) bool {
		return strings.ContainsRune(" \t\r\n，。！？；：、（）()[]{}<>\"'`", r)
	}) {
		token = strings.Trim(token, ".,;:!?")
		if token == "" {
			continue
		}
		if strings.Contains(token, "/") && containsASCIIAlphaNumeric(token) {
			return true
		}
		for _, suffix := range []string{".go", ".ts", ".tsx", ".js", ".jsx", ".svelte", ".vue", ".py", ".rs", ".java", ".json", ".yaml", ".yml", ".toml", ".md", ".txt"} {
			if strings.HasSuffix(strings.ToLower(token), suffix) {
				return true
			}
		}
	}
	return false
}

func containsASCIIAlphaNumeric(value string) bool {
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			return true
		}
	}
	return false
}

func (a *App) todayAgendaReply(now time.Time) string {
	events, eventErr := a.ListCalendarEvents()
	todos, todoErr := a.ListTodos()
	if eventErr != nil || todoErr != nil {
		return "暂时无法读取本地日程或待办，请稍后重试。"
	}
	return formatTodayAgendaReply(now, events, todos)
}

func formatTodayAgendaReply(today time.Time, events []WorkbenchCalendarEventView, todos []WorkbenchTodoView) string {
	today = today.In(today.Location())
	todayEvents := make([]WorkbenchCalendarEventView, 0)
	for _, event := range events {
		if calendarEventIsToday(event, today) {
			todayEvents = append(todayEvents, event)
		}
	}
	sort.SliceStable(todayEvents, func(i, j int) bool {
		return agendaTimeKey(todayEvents[i].Time, todayEvents[i].Title) < agendaTimeKey(todayEvents[j].Time, todayEvents[j].Title)
	})

	todayTodos := make([]WorkbenchTodoView, 0)
	for _, todo := range todos {
		if todoIsDueToday(todo, today) {
			todayTodos = append(todayTodos, todo)
		}
	}
	sort.SliceStable(todayTodos, func(i, j int) bool {
		return agendaTimeKey(firstNonEmptyAgenda(todayTodos[i].DueAt, todayTodos[i].DueLabel), todayTodos[i].Title) < agendaTimeKey(firstNonEmptyAgenda(todayTodos[j].DueAt, todayTodos[j].DueLabel), todayTodos[j].Title)
	})

	dateLabel := today.Format("2006年01月02日")
	if len(todayEvents) == 0 && len(todayTodos) == 0 {
		return fmt.Sprintf("今天（%s）暂时没有已安排的日程或待办。", dateLabel)
	}

	var reply strings.Builder
	fmt.Fprintf(&reply, "今天的安排（%s）：", dateLabel)
	if len(todayEvents) > 0 {
		reply.WriteString("\n\n日程：")
		for _, event := range todayEvents {
			reply.WriteString("\n- ")
			if value := strings.TrimSpace(event.Time); value != "" {
				reply.WriteString(value)
				reply.WriteByte(' ')
			}
			reply.WriteString(strings.TrimSpace(event.Title))
			if place := strings.TrimSpace(event.Place); place != "" {
				reply.WriteString("（")
				reply.WriteString(place)
				reply.WriteString("）")
			}
		}
	}
	if len(todayTodos) > 0 {
		reply.WriteString("\n\n待办：")
		for _, todo := range todayTodos {
			reply.WriteString("\n- ")
			if priority := strings.TrimSpace(todo.Priority); priority != "" {
				reply.WriteString("[")
				reply.WriteString(priority)
				reply.WriteString("] ")
			}
			reply.WriteString(strings.TrimSpace(todo.Title))
			if due := agendaTodoDueLabel(todo, today); due != "" {
				reply.WriteString("（")
				reply.WriteString(due)
				reply.WriteString("）")
			}
		}
	}
	return reply.String()
}

func calendarEventIsToday(event WorkbenchCalendarEventView, today time.Time) bool {
	date := strings.TrimSpace(event.Date)
	if date != "" {
		return strings.HasPrefix(date, today.Format("2006-01-02"))
	}
	day, err := strconv.Atoi(strings.TrimSpace(event.Day))
	return err == nil && day == today.Day()
}

func todoIsDueToday(todo WorkbenchTodoView, today time.Time) bool {
	if todoIsCompleted(todo.Status) {
		return false
	}
	if dueAt := strings.TrimSpace(todo.DueAt); dueAt != "" {
		return strings.HasPrefix(dueAt, today.Format("2006-01-02"))
	}
	label := strings.TrimSpace(strings.ToLower(todo.DueLabel))
	if label == "今天" || label == "今日" || label == "today" {
		return true
	}
	if _, err := time.Parse("15:04", label); err == nil {
		return true
	}
	return strings.HasPrefix(label, today.Format("2006-01-02")) || strings.HasPrefix(label, today.Format("01-02")) || strings.HasPrefix(label, today.Format("01/02"))
}

func todoIsCompleted(status string) bool {
	status = strings.ToLower(strings.TrimSpace(status))
	return status == "done" || status == "completed" || status == "cancelled" || status == "canceled" || strings.Contains(status, "已完成") || strings.Contains(status, "已取消")
}

func agendaTodoDueLabel(todo WorkbenchTodoView, today time.Time) string {
	if dueAt := strings.TrimSpace(todo.DueAt); dueAt != "" {
		if parsed, err := time.Parse(time.RFC3339, dueAt); err == nil {
			return parsed.In(today.Location()).Format("15:04")
		}
		return dueAt
	}
	return strings.TrimSpace(todo.DueLabel)
}

func agendaTimeKey(value, fallback string) string {
	value = strings.TrimSpace(value)
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed.Format(time.RFC3339) + "\x00" + fallback
	}
	if len(value) >= 5 {
		if parsed, err := time.Parse("15:04", value[:5]); err == nil {
			return parsed.Format("15:04") + "\x00" + fallback
		}
	}
	return "99:99\x00" + value + "\x00" + fallback
}

func firstNonEmptyAgenda(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
