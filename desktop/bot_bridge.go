package main

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"reasonix/internal/bot"
	"reasonix/internal/event"
)

// botBridgeHub 是 bot 网关对桌面端的"上帝视角"桥（bot.DesktopBridge 的实现）。
//
// 职责边界（刻意保持窄）：
//   - 观察：tabEventSink.Emit 把每个桌面会话的事件旁路到 observe；hub 记录
//     待审批/待回答项，并把审批请求、任务完成/出错推送给订阅聊天。
//   - 遥控审批：/desktop approve|deny|answer 经 App.ApproveTab /
//     AnswerQuestionForTab 按 tab 寻址回写。controller 侧幂等（先到者赢），
//     桌面 UI 与远端并发应答互不干扰。
//   - 不做：向桌面会话注入输入、抢占写 lease。将来的显式接管在
//     bot.DesktopBridge 上扩展，底层走 internal/control 的接管端口。
//
// observe 跑在 controller 的事件 goroutine 上，绝不能做网络调用——通知统一
// 进有界队列由 worker 异步发送，队列满时丢弃并告警。
type botBridgeHub struct {
	listTabs   func() []TabMeta
	approveTab func(tabID, id string, allow, session, persist bool)
	answerTab  func(tabID, id string, answers []QuestionAnswer)
	notify     func(ctx context.Context, connectionID, domain string, msg bot.OutboundMessage) (bot.SendResult, error)
	logger     *slog.Logger

	mu       sync.Mutex
	watchers map[string]bot.DesktopWatchRoute
	pending  map[string]desktopPendingPrompt

	queue chan desktopBridgeNotification
}

type desktopPendingPrompt struct {
	tabID     string
	kind      string // "approval" | "ask"
	tool      string
	subject   string
	questions []event.AskQuestion
}

// desktopBridgeNotification 是一条待推送的桌面事件。card 按订阅路由现做
// （chat_type 因聊天而异）；text 同时是非卡片平台的完整降级文案。
type desktopBridgeNotification struct {
	text string
	card func(route bot.DesktopWatchRoute) *bot.InteractiveCard
}

const (
	botBridgeQueueSize     = 64
	botBridgeSendTimeout   = 15 * time.Second
	botBridgeSubjectLimit  = 200
	botBridgePendingLimit  = 200
	botBridgeErrTextLimit  = 300
	botBridgePromptPreview = 500
)

func newBotBridgeHub(
	listTabs func() []TabMeta,
	approveTab func(tabID, id string, allow, session, persist bool),
	answerTab func(tabID, id string, answers []QuestionAnswer),
	notify func(ctx context.Context, connectionID, domain string, msg bot.OutboundMessage) (bot.SendResult, error),
	logger *slog.Logger,
) *botBridgeHub {
	if logger == nil {
		logger = slog.Default()
	}
	h := &botBridgeHub{
		listTabs:   listTabs,
		approveTab: approveTab,
		answerTab:  answerTab,
		notify:     notify,
		logger:     logger.With("component", "bot_bridge"),
		watchers:   make(map[string]bot.DesktopWatchRoute),
		pending:    make(map[string]desktopPendingPrompt),
		queue:      make(chan desktopBridgeNotification, botBridgeQueueSize),
	}
	go h.run()
	return h
}

// observe 接收某个桌面会话的一条事件。在 controller 事件 goroutine 上运行，
// 只做内存记账和入队，不做任何阻塞调用。
func (h *botBridgeHub) observe(tabID string, e event.Event) {
	switch e.Kind {
	case event.ApprovalRequest:
		h.mu.Lock()
		h.rememberPendingLocked(e.Approval.ID, desktopPendingPrompt{
			tabID:   tabID,
			kind:    "approval",
			tool:    e.Approval.Tool,
			subject: truncateForBridge(e.Approval.Subject, botBridgeSubjectLimit),
		})
		watching := len(h.watchers) > 0
		h.mu.Unlock()
		if watching {
			h.enqueue(h.approvalNotification(tabID, e.Approval))
		}
	case event.AskRequest:
		h.mu.Lock()
		h.rememberPendingLocked(e.Ask.ID, desktopPendingPrompt{
			tabID:     tabID,
			kind:      "ask",
			questions: e.Ask.Questions,
		})
		watching := len(h.watchers) > 0
		h.mu.Unlock()
		if watching {
			h.enqueue(h.askNotification(tabID, e.Ask))
		}
	case event.TurnDone:
		h.mu.Lock()
		for id, p := range h.pending {
			if p.tabID == tabID {
				delete(h.pending, id)
			}
		}
		watching := len(h.watchers) > 0
		h.mu.Unlock()
		if !watching {
			return
		}
		if e.Err != nil && strings.Contains(e.Err.Error(), "context canceled") {
			// 桌面端主动停止的任务不推送，避免正常操作变成噪音。
			return
		}
		h.enqueue(h.turnDoneNotification(tabID, e.Err))
	}
}

// rememberPendingLocked 记录待处理项；容量兜底防泄漏（正常路径 TurnDone 会清理）。
func (h *botBridgeHub) rememberPendingLocked(id string, p desktopPendingPrompt) {
	if strings.TrimSpace(id) == "" {
		return
	}
	if len(h.pending) >= botBridgePendingLimit {
		h.pending = make(map[string]desktopPendingPrompt)
	}
	h.pending[id] = p
}

func (h *botBridgeHub) enqueue(n desktopBridgeNotification) {
	select {
	case h.queue <- n:
	default:
		h.logger.Warn("desktop bridge notification queue full; dropping")
	}
}

func (h *botBridgeHub) run() {
	for n := range h.queue {
		h.deliver(n)
	}
}

func (h *botBridgeHub) deliver(n desktopBridgeNotification) {
	h.mu.Lock()
	routes := make([]bot.DesktopWatchRoute, 0, len(h.watchers))
	for _, r := range h.watchers {
		routes = append(routes, r)
	}
	notify := h.notify
	h.mu.Unlock()
	if notify == nil || len(routes) == 0 {
		return
	}
	for _, route := range routes {
		msg := bot.OutboundMessage{
			ChatID:   route.ChatID,
			ChatType: route.ChatType,
			Text:     n.text,
		}
		if n.card != nil {
			msg.Card = n.card(route)
		}
		ctx, cancel := context.WithTimeout(context.Background(), botBridgeSendTimeout)
		if _, err := notify(ctx, route.ConnectionID, route.Domain, msg); err != nil {
			h.logger.Warn("desktop bridge notification send failed", "platform", route.Platform, "err", err)
		}
		cancel()
	}
}

// tabLabel 把 tabID 解析成人类可读的会话名。
func (h *botBridgeHub) tabLabel(tabID string) string {
	if h.listTabs != nil {
		for _, t := range h.listTabs() {
			if t.ID != tabID {
				continue
			}
			if label := strings.TrimSpace(t.Label); label != "" {
				return label
			}
			if title := strings.TrimSpace(t.TopicTitle); title != "" {
				return title
			}
			break
		}
	}
	return "(未命名会话)"
}

func (h *botBridgeHub) approvalNotification(tabID string, approval event.Approval) desktopBridgeNotification {
	label := h.tabLabel(tabID)
	text := fmt.Sprintf("⚠️ 桌面会话「%s」需要批准操作\n工具: %s\n操作: %s\n\nID: `%s`\n用 /desktop approve %s 批准，/desktop deny %s 拒绝。桌面端先处理则以先到者为准。",
		label, approval.Tool, truncateForBridge(approval.Subject, botBridgeSubjectLimit), approval.ID, approval.ID, approval.ID)
	return desktopBridgeNotification{
		text: text,
		card: func(route bot.DesktopWatchRoute) *bot.InteractiveCard {
			return &bot.InteractiveCard{
				Header: "桌面会话需要批准",
				Elements: []bot.InteractiveCardElement{
					{Tag: "markdown", Content: fmt.Sprintf("**会话**: %s\n\n**工具**: %s\n\n**操作**: %s\n\nID: `%s`", label, approval.Tool, truncateForBridge(approval.Subject, botBridgeSubjectLimit), approval.ID)},
					{Tag: "action", Extra: map[string]any{
						"actions": []map[string]any{
							desktopCardButton("允许一次", "primary", "/desktop approve "+approval.ID, route),
							desktopCardButton("拒绝", "danger", "/desktop deny "+approval.ID, route),
						},
					}},
				},
			}
		},
	}
}

func (h *botBridgeHub) askNotification(tabID string, ask event.Ask) desktopBridgeNotification {
	label := h.tabLabel(tabID)
	var b strings.Builder
	fmt.Fprintf(&b, "❓ 桌面会话「%s」在等待回答:\n", label)
	for i, q := range ask.Questions {
		fmt.Fprintf(&b, "\n**%d. %s**\n", i+1, truncateForBridge(q.Prompt, botBridgePromptPreview))
		for j, opt := range q.Options {
			fmt.Fprintf(&b, "  %d. %s\n", j+1, opt.Label)
		}
	}
	fmt.Fprintf(&b, "\nID: `%s`\n用 /desktop answer %s <选项编号或文本> 回答；桌面端先处理则以先到者为准。", ask.ID, ask.ID)
	text := b.String()

	var card func(route bot.DesktopWatchRoute) *bot.InteractiveCard
	if len(ask.Questions) == 1 && len(ask.Questions[0].Options) > 0 {
		options := ask.Questions[0].Options
		card = func(route bot.DesktopWatchRoute) *bot.InteractiveCard {
			actions := make([]map[string]any, 0, len(options))
			for i, opt := range options {
				optLabel := strings.TrimSpace(opt.Label)
				if optLabel == "" {
					optLabel = fmt.Sprintf("选项 %d", i+1)
				}
				actions = append(actions, desktopCardButton(optLabel, "primary", fmt.Sprintf("/desktop answer %s %d", ask.ID, i+1), route))
			}
			return &bot.InteractiveCard{
				Header: "桌面会话在等待回答",
				Elements: []bot.InteractiveCardElement{
					{Tag: "markdown", Content: text},
					{Tag: "action", Extra: map[string]any{"actions": actions}},
				},
			}
		}
	}
	return desktopBridgeNotification{text: text, card: card}
}

func (h *botBridgeHub) turnDoneNotification(tabID string, err error) desktopBridgeNotification {
	label := h.tabLabel(tabID)
	if err != nil {
		return desktopBridgeNotification{text: fmt.Sprintf("❌ 桌面会话「%s」任务出错: %s", label, truncateForBridge(err.Error(), botBridgeErrTextLimit))}
	}
	return desktopBridgeNotification{text: fmt.Sprintf("✅ 桌面会话「%s」任务完成。", label)}
}

func desktopCardButton(label, style, command string, route bot.DesktopWatchRoute) map[string]any {
	return map[string]any{
		"tag":  "button",
		"text": map[string]string{"tag": "plain_text", "content": label},
		"type": style,
		"value": map[string]string{
			"command":   command,
			"chat_type": string(route.ChatType),
		},
	}
}

func truncateForBridge(s string, limit int) string {
	s = strings.TrimSpace(s)
	runes := []rune(s)
	if len(runes) <= limit {
		return s
	}
	return string(runes[:limit]) + "…"
}

// ---- bot.DesktopBridge 实现 ----

func (h *botBridgeHub) Sessions() []bot.DesktopSessionInfo {
	if h.listTabs == nil {
		return nil
	}
	tabs := h.listTabs()
	out := make([]bot.DesktopSessionInfo, 0, len(tabs))
	for _, t := range tabs {
		out = append(out, bot.DesktopSessionInfo{
			TabID:         t.ID,
			Label:         t.Label,
			Workspace:     t.WorkspaceName,
			Topic:         t.TopicTitle,
			Ready:         t.Ready,
			Running:       t.Running,
			PendingPrompt: t.PendingPrompt,
		})
	}
	return out
}

func (h *botBridgeHub) SetWatch(route bot.DesktopWatchRoute, enable bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if enable {
		h.watchers[route.Key()] = route
		return
	}
	delete(h.watchers, route.Key())
}

func (h *botBridgeHub) Watching(route bot.DesktopWatchRoute) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	_, ok := h.watchers[route.Key()]
	return ok
}

func (h *botBridgeHub) Approve(approvalID string, allow bool) (string, error) {
	approvalID = strings.TrimSpace(approvalID)
	h.mu.Lock()
	p, ok := h.pending[approvalID]
	if ok && p.kind == "approval" {
		delete(h.pending, approvalID)
	}
	h.mu.Unlock()
	if !ok || p.kind != "approval" {
		return "", fmt.Errorf("未找到待处理的审批 %s（可能已在桌面端处理或已超时）。用 /desktop status 查看当前会话。", approvalID)
	}
	if h.approveTab == nil {
		return "", fmt.Errorf("桌面端审批通道不可用。")
	}
	h.approveTab(p.tabID, approvalID, allow, false, false)
	action := "批准"
	if !allow {
		action = "拒绝"
	}
	return fmt.Sprintf("已提交%s「%s」的操作（%s）。桌面端若已先处理，以先到者为准。", action, h.tabLabel(p.tabID), p.tool), nil
}

func (h *botBridgeHub) AskQuestions(askID string) ([]event.AskQuestion, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	p, ok := h.pending[strings.TrimSpace(askID)]
	if !ok || p.kind != "ask" {
		return nil, false
	}
	return p.questions, true
}

func (h *botBridgeHub) Answer(askID string, answers []event.AskAnswer) (string, error) {
	askID = strings.TrimSpace(askID)
	h.mu.Lock()
	p, ok := h.pending[askID]
	if ok && p.kind == "ask" {
		delete(h.pending, askID)
	}
	h.mu.Unlock()
	if !ok || p.kind != "ask" {
		return "", fmt.Errorf("未找到待回答的提问 %s（可能已在桌面端回答或已超时）。", askID)
	}
	if h.answerTab == nil {
		return "", fmt.Errorf("桌面端问答通道不可用。")
	}
	out := make([]QuestionAnswer, 0, len(answers))
	for _, an := range answers {
		out = append(out, QuestionAnswer{QuestionID: an.QuestionID, Selected: an.Selected})
	}
	h.answerTab(p.tabID, askID, out)
	return fmt.Sprintf("已提交「%s」的回答。桌面端若已先处理，以先到者为准。", h.tabLabel(p.tabID)), nil
}
