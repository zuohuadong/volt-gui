package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"voltui/internal/config"
	"voltui/internal/fileutil"
)

const agentsFile = "agents.json"

type PersistentAgentView struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Role        string   `json:"role"`
	Runs        int      `json:"runs"`
	Status      string   `json:"status"`
	Desc        string   `json:"desc"`
	Avatar      string   `json:"avatar,omitempty"`
	Vibe        string   `json:"vibe,omitempty"`
	Provider    string   `json:"provider,omitempty"`
	Model       string   `json:"model,omitempty"`
	Tools       []string `json:"tools"`
	Skills      []string `json:"skills"`
	CoreFiles   []string `json:"coreFiles"`
	BuiltIn     bool     `json:"builtIn"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
	LastRunAt   string   `json:"lastRunAt,omitempty"`
	Description string   `json:"description,omitempty"`
}

type PersistentAgentInput struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Role      string   `json:"role"`
	Status    string   `json:"status"`
	Desc      string   `json:"desc"`
	Avatar    string   `json:"avatar"`
	Vibe      string   `json:"vibe"`
	Provider  string   `json:"provider"`
	Model     string   `json:"model"`
	Tools     []string `json:"tools"`
	Skills    []string `json:"skills"`
	CoreFiles []string `json:"coreFiles"`
}

type agentsDiskFile struct {
	Agents []PersistentAgentView `json:"agents"`
}

func (a *App) ListAgents() ([]PersistentAgentView, error) {
	agents, err := loadAgents()
	if err != nil {
		return nil, err
	}
	return agents, nil
}

func (a *App) SaveAgent(input PersistentAgentInput) (PersistentAgentView, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return PersistentAgentView{}, errors.New("agent name is required")
	}
	agents, err := loadAgents()
	if err != nil {
		return PersistentAgentView{}, err
	}
	now := time.Now().Format(time.RFC3339)
	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = uniqueAgentID(slugifyAgentID(name), agents)
	}
	next := PersistentAgentView{
		ID:        id,
		Name:      name,
		Role:      defaultString(strings.TrimSpace(input.Role), "自定义"),
		Runs:      0,
		Status:    defaultString(strings.TrimSpace(input.Status), "已启用"),
		Desc:      strings.TrimSpace(input.Desc),
		Avatar:    strings.TrimSpace(input.Avatar),
		Vibe:      strings.TrimSpace(input.Vibe),
		Provider:  strings.TrimSpace(input.Provider),
		Model:     strings.TrimSpace(input.Model),
		Tools:     nonNil(input.Tools),
		Skills:    nonNil(input.Skills),
		CoreFiles: nonNil(input.CoreFiles),
		CreatedAt: now,
		UpdatedAt: now,
	}
	if next.Desc == "" {
		next.Desc = "尚未分配具体职能。"
	}
	replaced := false
	for i, existing := range agents {
		if existing.ID != id {
			continue
		}
		next.Runs = existing.Runs
		next.BuiltIn = existing.BuiltIn
		next.CreatedAt = defaultString(existing.CreatedAt, now)
		next.LastRunAt = existing.LastRunAt
		agents[i] = next
		replaced = true
		break
	}
	if !replaced {
		agents = append([]PersistentAgentView{next}, agents...)
	}
	sortAgents(agents)
	if err := saveAgents(agents); err != nil {
		return PersistentAgentView{}, err
	}
	return next, nil
}

func (a *App) DeleteAgent(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("agent id is required")
	}
	agents, err := loadAgents()
	if err != nil {
		return err
	}
	next := agents[:0]
	found := false
	for _, agent := range agents {
		if agent.ID == id {
			found = true
			continue
		}
		next = append(next, agent)
	}
	if !found {
		return nil
	}
	return saveAgents(next)
}

func agentsPath() (string, error) {
	userConfig := config.UserConfigPath()
	if strings.TrimSpace(userConfig) == "" {
		return "", errors.New("user config dir is unavailable")
	}
	return filepath.Join(filepath.Dir(userConfig), agentsFile), nil
}

func loadAgents() ([]PersistentAgentView, error) {
	path, err := agentsPath()
	if err != nil {
		return defaultAgents(), nil
	}
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultAgents(), nil
		}
		return nil, err
	}
	var disk agentsDiskFile
	if err := json.Unmarshal(b, &disk); err != nil {
		return nil, err
	}
	agents := mergeDefaultAgents(disk.Agents)
	sortAgents(agents)
	return agents, nil
}

func saveAgents(agents []PersistentAgentView) error {
	path, err := agentsPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(agentsDiskFile{Agents: agents}, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".agents.*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return fileutil.ReplaceFile(tmpPath, path)
}

func defaultAgents() []PersistentAgentView {
	now := time.Now().Format(time.RFC3339)
	return []PersistentAgentView{
		{ID: "code-review", Name: "代码审查 Agent", Role: "内置", Runs: 128, Status: "已启用", Desc: "阅读仓库上下文，发现风险、缺失测试和回归点。", Avatar: "C", Provider: "OpenAI", Model: "GPT-4o", Tools: []string{"workspace", "git", "terminal"}, Skills: []string{"code-review"}, CoreFiles: []string{"AGENTS.md"}, BuiltIn: true, CreatedAt: now, UpdatedAt: now},
		{ID: "research", Name: "资料研究 Agent", Role: "自定义", Runs: 64, Status: "已启用", Desc: "汇总文档、网页和项目资料，输出可执行摘要。", Avatar: "R", Provider: "OpenAI", Model: "GPT-4o", Tools: []string{"web", "workspace"}, Skills: []string{"research"}, CoreFiles: []string{"references"}, CreatedAt: now, UpdatedAt: now},
		{ID: "automation", Name: "自动化 Agent", Role: "已蒸馏", Runs: 37, Status: "已停用", Desc: "把重复工作转为可配置的计划任务和监控。", Avatar: "A", Provider: "OpenAI", Model: "GPT-4o", Tools: []string{"terminal", "scheduler"}, Skills: []string{"workflow"}, CoreFiles: []string{"automations"}, CreatedAt: now, UpdatedAt: now},
	}
}

func mergeDefaultAgents(saved []PersistentAgentView) []PersistentAgentView {
	byID := map[string]PersistentAgentView{}
	for _, agent := range defaultAgents() {
		byID[agent.ID] = normalizeAgent(agent)
	}
	for _, agent := range saved {
		agent = normalizeAgent(agent)
		if agent.ID == "" {
			continue
		}
		byID[agent.ID] = agent
	}
	out := make([]PersistentAgentView, 0, len(byID))
	for _, agent := range byID {
		out = append(out, agent)
	}
	return out
}

func normalizeAgent(agent PersistentAgentView) PersistentAgentView {
	agent.ID = strings.TrimSpace(agent.ID)
	agent.Name = defaultString(strings.TrimSpace(agent.Name), "未命名 Agent")
	agent.Role = defaultString(strings.TrimSpace(agent.Role), "自定义")
	agent.Status = defaultString(strings.TrimSpace(agent.Status), "已启用")
	agent.Desc = defaultString(strings.TrimSpace(agent.Desc), strings.TrimSpace(agent.Description))
	if agent.Desc == "" {
		agent.Desc = "尚未分配具体职能。"
	}
	agent.Tools = nonNil(agent.Tools)
	agent.Skills = nonNil(agent.Skills)
	agent.CoreFiles = nonNil(agent.CoreFiles)
	now := time.Now().Format(time.RFC3339)
	agent.CreatedAt = defaultString(agent.CreatedAt, now)
	agent.UpdatedAt = defaultString(agent.UpdatedAt, agent.CreatedAt)
	return agent
}

func sortAgents(agents []PersistentAgentView) {
	sort.SliceStable(agents, func(i, j int) bool {
		if agents[i].BuiltIn != agents[j].BuiltIn {
			return agents[i].BuiltIn
		}
		return agents[i].UpdatedAt > agents[j].UpdatedAt
	})
}

func slugifyAgentID(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	lastDash := false
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if r > 127 {
			b.WriteString(fmt.Sprintf("%x", r))
			lastDash = false
			continue
		}
		if !lastDash && b.Len() > 0 {
			b.WriteByte('-')
			lastDash = true
		}
	}
	id := strings.Trim(b.String(), "-")
	if id == "" {
		return "agent"
	}
	return id
}

func uniqueAgentID(base string, agents []PersistentAgentView) string {
	seen := map[string]struct{}{}
	for _, agent := range agents {
		seen[agent.ID] = struct{}{}
	}
	if _, ok := seen[base]; !ok {
		return base
	}
	for i := 2; ; i++ {
		id := fmt.Sprintf("%s-%d", base, i)
		if _, ok := seen[id]; !ok {
			return id
		}
	}
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}
