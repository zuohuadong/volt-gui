package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"voltui/internal/boot"
	"voltui/internal/config"
	"voltui/internal/provider"
)

const defaultTeamRuntimeAgentTimeout = 30 * time.Second

type WorkbenchTeamRuntimeInput struct {
	TeamID      string   `json:"teamId"`
	Task        string   `json:"task"`
	ModelRef    string   `json:"modelRef,omitempty"`
	Attachments []string `json:"attachments,omitempty"`
}

type WorkbenchTeamRuntimeResult struct {
	Room     WorkbenchTeamRoomView          `json:"room"`
	Run      WorkbenchTeamRunView           `json:"run"`
	Messages []WorkbenchTeamChatMessageView `json:"messages"`
}

type teamRuntimeProviderFactory func(app *App, modelRef string) (provider.Provider, string, error)

var newTeamRuntimeProvider teamRuntimeProviderFactory = defaultTeamRuntimeProvider

func (a *App) RunTeamRuntime(input WorkbenchTeamRuntimeInput) (WorkbenchTeamRuntimeResult, error) {
	teamID := strings.TrimSpace(input.TeamID)
	task := strings.TrimSpace(input.Task)
	if teamID == "" {
		return WorkbenchTeamRuntimeResult{}, errors.New("team id is required")
	}
	if task == "" {
		return WorkbenchTeamRuntimeResult{}, errors.New("team task is required")
	}

	data, err := loadWorkbenchData()
	if err != nil {
		return WorkbenchTeamRuntimeResult{}, err
	}
	roomIndex := -1
	for i, room := range data.TeamRooms {
		if room.ID == teamID {
			roomIndex = i
			break
		}
	}
	if roomIndex < 0 {
		return WorkbenchTeamRuntimeResult{}, fmt.Errorf("team room %q not found", teamID)
	}
	room := data.TeamRooms[roomIndex]
	agents, err := loadAgents()
	if err != nil {
		return WorkbenchTeamRuntimeResult{}, err
	}
	members := teamRuntimeMembers(room, agents)
	if len(members) == 0 {
		return WorkbenchTeamRuntimeResult{}, errors.New("team has no runnable agents")
	}

	prov, modelLabel, err := newTeamRuntimeProvider(a, input.ModelRef)
	if err != nil {
		return WorkbenchTeamRuntimeResult{}, err
	}

	now := time.Now()
	runID := uniqueWorkbenchDataID(slugifyAgentID(room.ID+"-"+task), teamRunIDs(data.TeamRuns))
	runTitle := trimRunTitle(task)
	run := WorkbenchTeamRunView{
		ID:            runID,
		TeamID:        room.ID,
		Title:         runTitle,
		Status:        "running",
		Task:          task,
		CreatedAt:     now.Format(time.RFC3339),
		UpdatedAt:     now.Format(time.RFC3339),
		CurrentStepID: firstTeamStepID(room),
		Events: []WorkbenchTeamRunEventView{
			{ID: runID + "-created", Time: now.Format(time.RFC3339), Actor: "用户", Type: "创建运行", Detail: "发起任务：" + task},
			{ID: runID + "-runtime", Time: now.Format(time.RFC3339), Actor: "协作运行台", Type: "启动 runtime", Detail: fmt.Sprintf("使用 %s 调用 %d 个团队成员。", defaultString(modelLabel, "当前模型"), len(members))},
		},
		Artifacts: []WorkbenchTeamRunArtifactView{},
	}

	userMessage, err := saveTeamChatMessageInto(&data, WorkbenchTeamChatMessageView{
		ID:        runID + "-user",
		TeamID:    room.ID,
		Role:      "user",
		Content:   task,
		CreatedAt: now.Format(time.RFC3339),
	})
	if err != nil {
		return WorkbenchTeamRuntimeResult{}, err
	}
	successes := 0
	memberOutputs := make([]string, 0, len(members))
	for index, member := range members {
		run.CurrentStepID = teamStepIDForMember(room, index)
		run.Events = append(run.Events, WorkbenchTeamRunEventView{
			ID:     fmt.Sprintf("%s-%s-start", runID, member.ID),
			Time:   time.Now().Format(time.RFC3339),
			Actor:  member.Name,
			Type:   "开始执行",
			Detail: fmt.Sprintf("%s 正在处理团队任务。", member.Name),
		})
		reply, callErr := runTeamRuntimeAgent(a.bootContext(), prov, room, member, task, input.Attachments, memberOutputs)
		if callErr != nil {
			run.Events = append(run.Events, WorkbenchTeamRunEventView{
				ID:     fmt.Sprintf("%s-%s-error", runID, member.ID),
				Time:   time.Now().Format(time.RFC3339),
				Actor:  member.Name,
				Type:   "执行失败",
				Detail: callErr.Error(),
			})
			_, _ = saveTeamChatMessageInto(&data, WorkbenchTeamChatMessageView{
				ID:          fmt.Sprintf("%s-%s-error-message", runID, member.ID),
				TeamID:      room.ID,
				Role:        "agent",
				AgentID:     member.ID,
				AgentName:   member.Name,
				AgentAvatar: teamRuntimeAvatar(member),
				Content:     fmt.Sprintf("%s 执行失败：%s", member.Name, callErr.Error()),
				CreatedAt:   time.Now().Format(time.RFC3339),
			})
			continue
		}
		successes++
		memberOutputs = append(memberOutputs, fmt.Sprintf("%s：%s", member.Name, reply))
		_, err = saveTeamChatMessageInto(&data, WorkbenchTeamChatMessageView{
			ID:          fmt.Sprintf("%s-%s-reply", runID, member.ID),
			TeamID:      room.ID,
			Role:        "agent",
			AgentID:     member.ID,
			AgentName:   member.Name,
			AgentAvatar: teamRuntimeAvatar(member),
			Content:     reply,
			CreatedAt:   time.Now().Format(time.RFC3339),
		})
		if err != nil {
			return WorkbenchTeamRuntimeResult{}, err
		}
		run.Events = append(run.Events, WorkbenchTeamRunEventView{
			ID:     fmt.Sprintf("%s-%s-done", runID, member.ID),
			Time:   time.Now().Format(time.RFC3339),
			Actor:  member.Name,
			Type:   "完成输出",
			Detail: fmt.Sprintf("%s 已返回执行结果。", member.Name),
		})
		agents = bumpTeamRuntimeAgent(agents, member.ID)
	}

	run.UpdatedAt = time.Now().Format(time.RFC3339)
	if successes == 0 {
		run.Status = "stopped"
		run.Events = append(run.Events, WorkbenchTeamRunEventView{ID: runID + "-failed", Time: time.Now().Format(time.RFC3339), Actor: "协作运行台", Type: "运行失败", Detail: "所有团队成员调用失败，请检查模型配置、网络或 API Key。"})
	} else {
		artifacts, artifactErr := persistTeamRunArtifacts(run, memberOutputs)
		if artifactErr != nil {
			run.Status = "stopped"
			run.Events = append(run.Events, WorkbenchTeamRunEventView{ID: runID + "-artifact-error", Time: time.Now().Format(time.RFC3339), Actor: "协作运行台", Type: "产物持久化失败", Detail: artifactErr.Error()})
		} else {
			run.Status = "completed"
			run.Artifacts = artifacts
			run.Events = append(run.Events, WorkbenchTeamRunEventView{ID: runID + "-completed", Time: time.Now().Format(time.RFC3339), Actor: "协作运行台", Type: "运行完成", Detail: fmt.Sprintf("%d/%d 个团队成员完成输出，产物已写入本地文件。", successes, len(members))})
		}
	}
	if savedRun, err := saveTeamRunInto(&data, run); err == nil {
		run = savedRun
	} else {
		return WorkbenchTeamRuntimeResult{}, err
	}
	room.Active = "最近运行 " + runTitle
	room.Status = "已运行"
	room.Topic = runTitle
	room.Queue = fmt.Sprintf("%d 个成员已执行", successes)
	room.RunState = teamRuntimeRunState(run.Status)
	room.NextCheckpoint = "查看成员输出并决定是否归档产物"
	room.Outcome = fmt.Sprintf("%d/%d 个成员完成", successes, len(members))
	room.UpdatedAt = run.UpdatedAt
	replaceOrPrependTeamRoom(&data, room)
	appendOperationLog(&data, "执行团队协作", room.Title, "我的", run.Status)
	if err := saveWorkbenchData(data); err != nil {
		return WorkbenchTeamRuntimeResult{}, err
	}
	_ = saveAgents(agents)

	messages := teamMessagesForRoom(data.TeamChatMessages, room.ID)
	if len(messages) == 0 {
		messages = []WorkbenchTeamChatMessageView{userMessage}
	}
	return WorkbenchTeamRuntimeResult{Room: room, Run: run, Messages: messages}, nil
}

func defaultTeamRuntimeProvider(app *App, modelRef string) (provider.Provider, string, error) {
	entry, err := teamRuntimeProviderEntry(app, modelRef)
	if err != nil {
		return nil, "", err
	}
	if entry.RequiresAPIKey() && entry.APIKey() == "" {
		return nil, "", fmt.Errorf("模型 %s 需要 API Key，请先在模型设置中配置", entry.Name)
	}
	prov, err := boot.NewProvider(entry)
	if err != nil {
		return nil, "", err
	}
	return prov, teamRuntimeModelLabel(entry), nil
}

func teamRuntimeProviderEntry(app *App, modelRef string) (*config.ProviderEntry, error) {
	ref := strings.TrimSpace(modelRef)
	if ref != "" {
		cfg, err := config.LoadForRoot("")
		if err == nil {
			config.NormalizeLegacyMimoCustomProvidersForRefs(cfg, ref)
			resolved, _, ok := cfg.ResolveModelWithFallback(ref)
			if ok {
				if entry, ok := cfg.ResolveModel(resolved); ok {
					return entry, nil
				}
			}
		}
	}
	return app.currentProviderEntryForTab("")
}

func runTeamRuntimeAgent(parent context.Context, prov provider.Provider, room WorkbenchTeamRoomView, agent PersistentAgentView, task string, attachments []string, previousOutputs []string) (string, error) {
	ctx, cancel := context.WithTimeout(parent, defaultTeamRuntimeAgentTimeout)
	defer cancel()
	system := strings.Join([]string{
		"你是 VoltGUI 团队协作 runtime 中的一个真实 Agent。",
		"你的回答会直接展示在团队协作对话中，请使用简体中文。",
		"保持简洁、可执行，优先输出你负责的结论、风险和下一步。",
		"不要声称已经调用未接入的外部工具；只能基于输入上下文回答。",
	}, "\n")
	userParts := []string{
		"团队：" + room.Title,
		"协作模式：" + room.Mode,
		"共享上下文：" + room.SharedContext,
		"当前 Agent：" + agent.Name + " / " + agent.Desc,
		"团队任务：" + task,
	}
	if len(attachments) > 0 {
		userParts = append(userParts, "关联材料："+strings.Join(attachments, "、"))
	}
	if len(previousOutputs) > 0 {
		userParts = append(userParts, "前序成员输出：\n"+strings.Join(previousOutputs, "\n\n"))
	}
	chunks, err := prov.Stream(ctx, provider.Request{
		Messages: []provider.Message{
			{Role: provider.RoleSystem, Content: system},
			{Role: provider.RoleUser, Content: strings.Join(userParts, "\n")},
		},
		MaxTokens:   900,
		Temperature: provider.TemperaturePtr(0.2),
	})
	if err != nil {
		return "", err
	}
	var text strings.Builder
	for chunk := range chunks {
		switch chunk.Type {
		case provider.ChunkText:
			text.WriteString(chunk.Text)
		case provider.ChunkError:
			if chunk.Err != nil {
				return strings.TrimSpace(text.String()), chunk.Err
			}
		case provider.ChunkDone:
			result := strings.TrimSpace(text.String())
			if result == "" {
				return "", errors.New("model returned no visible content")
			}
			return result, nil
		}
	}
	if err := ctx.Err(); err != nil {
		return strings.TrimSpace(text.String()), err
	}
	result := strings.TrimSpace(text.String())
	if result == "" {
		return "", errors.New("model returned no visible content")
	}
	return result, nil
}

func teamRuntimeMembers(room WorkbenchTeamRoomView, agents []PersistentAgentView) []PersistentAgentView {
	byID := map[string]PersistentAgentView{}
	for _, agent := range agents {
		byID[agent.ID] = agent
	}
	ids := cleanAutomationLines(room.MemberIDs)
	if len(ids) == 0 && strings.TrimSpace(room.LeaderID) != "" {
		ids = []string{strings.TrimSpace(room.LeaderID)}
	}
	out := make([]PersistentAgentView, 0, len(ids))
	for _, id := range ids {
		agent, ok := byID[id]
		if !ok || strings.Contains(agent.Status, "停用") {
			continue
		}
		out = append(out, agent)
		if len(out) >= 4 {
			break
		}
	}
	return out
}

func persistTeamRunArtifacts(run WorkbenchTeamRunView, outputs []string) ([]WorkbenchTeamRunArtifactView, error) {
	dir, err := workbenchExportsDir()
	if err != nil {
		return nil, err
	}
	dir = filepath.Join(dir, "team-runs")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	base := defaultString(slugifyAgentID(run.ID), "team-run")
	markdownPath := filepath.Join(dir, base+".md")
	markdown := "# " + run.Title + "\n\n## 任务\n\n" + run.Task + "\n\n## 成员输出\n\n" + strings.Join(outputs, "\n\n") + "\n"
	if err := os.WriteFile(markdownPath, []byte(markdown), 0o644); err != nil {
		return nil, err
	}
	jsonPath := filepath.Join(dir, base+".json")
	payload, err := json.MarshalIndent(struct {
		RunID   string   `json:"runId"`
		TeamID  string   `json:"teamId"`
		Task    string   `json:"task"`
		Outputs []string `json:"outputs"`
	}{RunID: run.ID, TeamID: run.TeamID, Task: run.Task, Outputs: outputs}, "", "  ")
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(jsonPath, payload, 0o644); err != nil {
		return nil, err
	}
	return []WorkbenchTeamRunArtifactView{
		{ID: run.ID + "-markdown", Title: run.Title + " 团队输出", Type: "Markdown", Status: "已写入", Path: markdownPath},
		{ID: run.ID + "-json", Title: run.Title + " 结构化输出", Type: "JSON", Status: "已写入", Path: jsonPath},
	}, nil
}

func bumpTeamRuntimeAgent(agents []PersistentAgentView, id string) []PersistentAgentView {
	now := time.Now().Format(time.RFC3339)
	for i := range agents {
		if agents[i].ID == id {
			agents[i].Runs++
			agents[i].LastRunAt = now
			agents[i].UpdatedAt = now
			return agents
		}
	}
	return agents
}

func teamMessagesForRoom(messages []WorkbenchTeamChatMessageView, teamID string) []WorkbenchTeamChatMessageView {
	out := make([]WorkbenchTeamChatMessageView, 0, len(messages))
	for _, message := range messages {
		if message.TeamID == teamID {
			out = append(out, message)
		}
	}
	return out
}

func firstTeamStepID(room WorkbenchTeamRoomView) string {
	if len(room.Steps) == 0 {
		return ""
	}
	return room.Steps[0].ID
}

func teamStepIDForMember(room WorkbenchTeamRoomView, index int) string {
	if len(room.Steps) == 0 {
		return ""
	}
	if index < len(room.Steps) {
		return room.Steps[index].ID
	}
	return room.Steps[len(room.Steps)-1].ID
}

func teamRuntimeAvatar(agent PersistentAgentView) string {
	if strings.TrimSpace(agent.Avatar) != "" {
		return strings.TrimSpace(agent.Avatar)
	}
	name := strings.TrimSpace(agent.Name)
	if name == "" {
		return "A"
	}
	return string([]rune(name)[0])
}

func teamRuntimeModelLabel(entry *config.ProviderEntry) string {
	if entry == nil {
		return ""
	}
	if strings.TrimSpace(entry.Model) == "" {
		return strings.TrimSpace(entry.Name)
	}
	return strings.TrimSpace(entry.Name) + "/" + strings.TrimSpace(entry.Model)
}

func teamRuntimeRunState(status string) string {
	switch strings.TrimSpace(status) {
	case "completed":
		return "已完成"
	case "running":
		return "运行中"
	case "paused":
		return "已暂停"
	case "stopped":
		return "已停止"
	default:
		return defaultString(status, "已运行")
	}
}

func trimRunTitle(task string) string {
	runes := []rune(strings.TrimSpace(task))
	if len(runes) <= 28 {
		return string(runes)
	}
	return string(runes[:28]) + "..."
}
