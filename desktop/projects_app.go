package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"time"

	"voltui/internal/config"
	"voltui/internal/fileutil"
)

const workbenchProjectsFile = "workbench-projects.json"

type WorkbenchProjectView struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Code       string   `json:"code"`
	Client     string   `json:"client"`
	Stage      string   `json:"stage"`
	Owner      string   `json:"owner"`
	Desc       string   `json:"desc"`
	Category   string   `json:"category"`
	Court      string   `json:"court"`
	Budget     string   `json:"budget"`
	AcceptedAt string   `json:"acceptedAt"`
	Status     string   `json:"status"`
	Progress   int      `json:"progress"`
	Priority   string   `json:"priority"`
	Risk       string   `json:"risk"`
	UpdatedAt  string   `json:"updatedAt"`
	NextStep   string   `json:"nextStep"`
	Agent      string   `json:"agent"`
	Materials  int      `json:"materials"`
	Todos      int      `json:"todos"`
	Events     int      `json:"events"`
	Reports    int      `json:"reports"`
	Timeline   []string `json:"timeline"`
	CreatedAt  string   `json:"createdAt"`
	UpdatedISO string   `json:"updatedISO"`
}

type WorkbenchProjectInput struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Code       string   `json:"code"`
	Client     string   `json:"client"`
	Stage      string   `json:"stage"`
	Owner      string   `json:"owner"`
	Desc       string   `json:"desc"`
	Category   string   `json:"category"`
	Court      string   `json:"court"`
	Budget     string   `json:"budget"`
	AcceptedAt string   `json:"acceptedAt"`
	Status     string   `json:"status"`
	Progress   int      `json:"progress"`
	Priority   string   `json:"priority"`
	Risk       string   `json:"risk"`
	NextStep   string   `json:"nextStep"`
	Agent      string   `json:"agent"`
	Materials  int      `json:"materials"`
	Todos      int      `json:"todos"`
	Events     int      `json:"events"`
	Reports    int      `json:"reports"`
	Timeline   []string `json:"timeline"`
}

type workbenchProjectsDiskFile struct {
	Projects []WorkbenchProjectView `json:"projects"`
}

func (a *App) ListWorkbenchProjects() ([]WorkbenchProjectView, error) {
	projects, err := loadWorkbenchProjects()
	if err != nil {
		return nil, err
	}
	return projects, nil
}

func (a *App) SaveWorkbenchProject(input WorkbenchProjectInput) (WorkbenchProjectView, error) {
	return saveWorkbenchProjectInput(input)
}

func (a *App) DeleteWorkbenchProject(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("project id is required")
	}
	projects, err := loadWorkbenchProjects()
	if err != nil {
		return err
	}
	next := projects[:0]
	for _, project := range projects {
		if project.ID == id {
			continue
		}
		next = append(next, project)
	}
	return saveWorkbenchProjects(next)
}

func saveWorkbenchProjectInput(input WorkbenchProjectInput) (WorkbenchProjectView, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return WorkbenchProjectView{}, errors.New("project name is required")
	}
	projects, err := loadWorkbenchProjects()
	if err != nil {
		return WorkbenchProjectView{}, err
	}
	now := time.Now()
	nowISO := now.Format(time.RFC3339)
	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = uniqueWorkbenchProjectID(slugifyAgentID(name), projects)
	}
	next := WorkbenchProjectView{
		ID:         id,
		Name:       name,
		Code:       defaultString(strings.TrimSpace(input.Code), nextWorkbenchProjectCode(projects, now)),
		Client:     defaultString(strings.TrimSpace(input.Client), "未指定客户"),
		Stage:      defaultString(strings.TrimSpace(input.Stage), "进行中"),
		Owner:      defaultString(strings.TrimSpace(input.Owner), "项目负责人"),
		Desc:       strings.TrimSpace(input.Desc),
		Category:   defaultString(strings.TrimSpace(input.Category), "业务项目"),
		Court:      strings.TrimSpace(input.Court),
		Budget:     normalizeProjectBudget(input.Budget),
		AcceptedAt: defaultString(strings.TrimSpace(input.AcceptedAt), now.Format("2006-01-02")),
		Status:     normalizeWorkbenchProjectStatus(input.Status),
		Progress:   clampInt(input.Progress, 0, 100),
		Priority:   normalizeWorkbenchProjectPriority(input.Priority),
		Risk:       defaultString(strings.TrimSpace(input.Risk), "低风险"),
		UpdatedAt:  nowISO,
		NextStep:   strings.TrimSpace(input.NextStep),
		Agent:      strings.TrimSpace(input.Agent),
		Materials:  maxInt(input.Materials, 0),
		Todos:      maxInt(input.Todos, 0),
		Events:     maxInt(input.Events, 0),
		Reports:    maxInt(input.Reports, 0),
		Timeline:   cleanAutomationLines(input.Timeline),
		CreatedAt:  nowISO,
		UpdatedISO: nowISO,
	}
	replaced := false
	for i, existing := range projects {
		if existing.ID != id {
			continue
		}
		next.CreatedAt = defaultString(existing.CreatedAt, nowISO)
		projects[i] = next
		replaced = true
		break
	}
	if !replaced {
		projects = append([]WorkbenchProjectView{next}, projects...)
	}
	sortWorkbenchProjects(projects)
	if err := saveWorkbenchProjects(projects); err != nil {
		return WorkbenchProjectView{}, err
	}
	return next, nil
}

func workbenchProjectsPath() (string, error) {
	userConfig := config.UserConfigPath()
	if strings.TrimSpace(userConfig) == "" {
		return "", errors.New("user config dir is unavailable")
	}
	return filepath.Join(filepath.Dir(userConfig), workbenchProjectsFile), nil
}

func loadWorkbenchProjects() ([]WorkbenchProjectView, error) {
	path, err := workbenchProjectsPath()
	if err != nil {
		return []WorkbenchProjectView{}, nil
	}
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []WorkbenchProjectView{}, nil
		}
		return nil, err
	}
	var disk workbenchProjectsDiskFile
	if err := json.Unmarshal(b, &disk); err != nil {
		return nil, err
	}
	projects := make([]WorkbenchProjectView, 0, len(disk.Projects))
	migrated := false
	for _, project := range disk.Projects {
		if isLegacySeedProject(project) {
			migrated = true
			continue
		}
		project = normalizeWorkbenchProject(project)
		if project.ID != "" {
			projects = append(projects, project)
		}
	}
	sortWorkbenchProjects(projects)
	if migrated {
		if err := saveWorkbenchProjects(projects); err != nil {
			return nil, err
		}
	}
	return projects, nil
}

func saveWorkbenchProjects(projects []WorkbenchProjectView) error {
	path, err := workbenchProjectsPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(workbenchProjectsDiskFile{Projects: projects}, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".workbench-projects.*.tmp")
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

func isLegacySeedProject(project WorkbenchProjectView) bool {
	if project.CreatedAt == "" || project.CreatedAt != project.UpdatedISO {
		return false
	}
	switch strings.TrimSpace(project.ID) {
	// runtime-mock-guard: allow-legacy-cleanup
	case "volt-gui":
		// runtime-mock-guard: allow-legacy-cleanup
		expected := WorkbenchProjectView{ID: "volt-gui", Name: "Volt GUI 桌面端重构", Code: "PRJ-2026-0615", Client: "内部研发", Stage: "进行中", Owner: "产品工作台", Desc: "恢复 AoristLawer 式导航、Agent 与能力中心，并把 Coding 模式统一到新建对话。", Category: "桌面端重构", Court: "研发工作台", Budget: "1,200,000", AcceptedAt: "2026-06-15", Status: "active", Progress: 78, Priority: "高", Risk: "中风险", UpdatedAt: "28 分钟前", NextStep: "完成项目管理页深化并做构建验证", Agent: "代码审查 Agent", Materials: 12, Todos: 5, Events: 3, Reports: 4, Timeline: []string{"AORISTLAWER 参考界面已完成源码对照", "新建对话与代码状态入口已统一", "项目管理页进入深化验收"}, CreatedAt: project.CreatedAt, UpdatedISO: project.UpdatedISO}
		return reflect.DeepEqual(project, expected)
	// runtime-mock-guard: allow-legacy-cleanup
	case "lurefree":
		// runtime-mock-guard: allow-legacy-cleanup
		expected := WorkbenchProjectView{ID: "lurefree", Name: "Lurefree 小程序发布", Code: "PRJ-2026-0610", Client: "运营团队", Stage: "验证中", Owner: "增长项目", Desc: "小程序包体、地图交互、图钉资产与发布材料进入交付前验证。", Category: "小程序发布", Court: "增长项目组", Budget: "350,000", AcceptedAt: "2026-06-10", Status: "active", Progress: 64, Priority: "中", Risk: "低风险", UpdatedAt: "2 小时前", NextStep: "补齐地图与详情页回归清单", Agent: "资料研究 Agent", Materials: 8, Todos: 4, Events: 2, Reports: 2, Timeline: []string{"地图交互问题已纳入检查", "发布材料进入复核", "等待小程序预览确认"}, CreatedAt: project.CreatedAt, UpdatedISO: project.UpdatedISO}
		return reflect.DeepEqual(project, expected)
	// runtime-mock-guard: allow-legacy-cleanup
	case "homepage":
		// runtime-mock-guard: allow-legacy-cleanup
		expected := WorkbenchProjectView{ID: "homepage", Name: "品牌主页恢复与部署", Code: "PRJ-2026-0601", Client: "市场团队", Stage: "已归档", Owner: "官网项目", Desc: "恢复历史版本、验证构建并保留无截图校验流程。", Category: "官网运营", Court: "市场中台", Budget: "180,000", AcceptedAt: "2026-06-01", Status: "closed", Progress: 100, Priority: "低", Risk: "已关闭", UpdatedAt: "昨天", NextStep: "仅保留归档和复盘记录", Agent: "自动化 Agent", Materials: 5, Events: 1, Reports: 3, Timeline: []string{"历史版本已恢复", "构建验证已完成", "无截图校验流程已归档"}, CreatedAt: project.CreatedAt, UpdatedISO: project.UpdatedISO}
		return reflect.DeepEqual(project, expected)
	default:
		return false
	}
}

func normalizeWorkbenchProject(project WorkbenchProjectView) WorkbenchProjectView {
	project.ID = strings.TrimSpace(project.ID)
	project.Name = strings.TrimSpace(project.Name)
	if project.Name == "" {
		return WorkbenchProjectView{}
	}
	if project.ID == "" {
		project.ID = slugifyAgentID(project.Name)
	}
	now := time.Now()
	nowISO := now.Format(time.RFC3339)
	project.Code = defaultString(strings.TrimSpace(project.Code), fmt.Sprintf("%s-01", workbenchProjectCodePrefix(now)))
	project.Client = defaultString(strings.TrimSpace(project.Client), "未指定客户")
	project.Stage = defaultString(strings.TrimSpace(project.Stage), "进行中")
	project.Owner = defaultString(strings.TrimSpace(project.Owner), "项目负责人")
	project.Desc = strings.TrimSpace(project.Desc)
	project.Category = defaultString(strings.TrimSpace(project.Category), "业务项目")
	project.Court = strings.TrimSpace(project.Court)
	project.Budget = normalizeProjectBudget(project.Budget)
	project.AcceptedAt = defaultString(strings.TrimSpace(project.AcceptedAt), now.Format("2006-01-02"))
	project.Status = normalizeWorkbenchProjectStatus(project.Status)
	project.Progress = clampInt(project.Progress, 0, 100)
	project.Priority = normalizeWorkbenchProjectPriority(project.Priority)
	project.Risk = defaultString(strings.TrimSpace(project.Risk), "低风险")
	project.UpdatedAt = defaultString(strings.TrimSpace(project.UpdatedAt), project.UpdatedISO)
	project.NextStep = strings.TrimSpace(project.NextStep)
	project.Agent = strings.TrimSpace(project.Agent)
	project.Materials = maxInt(project.Materials, 0)
	project.Todos = maxInt(project.Todos, 0)
	project.Events = maxInt(project.Events, 0)
	project.Reports = maxInt(project.Reports, 0)
	project.Timeline = cleanAutomationLines(project.Timeline)
	project.CreatedAt = defaultString(project.CreatedAt, nowISO)
	project.UpdatedISO = defaultString(project.UpdatedISO, project.CreatedAt)
	return project
}

func normalizeWorkbenchProjectStatus(value string) string {
	switch strings.TrimSpace(value) {
	case "closed", "已归档", "done":
		return "closed"
	default:
		return "active"
	}
}

func normalizeWorkbenchProjectPriority(value string) string {
	switch strings.TrimSpace(value) {
	case "高", "high":
		return "高"
	case "低", "low":
		return "低"
	default:
		return "中"
	}
}

func normalizeProjectBudget(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "0"
	}
	return value
}

func workbenchProjectCodePrefix(now time.Time) string {
	return fmt.Sprintf("PRJ-%s-%s", now.Format("2006"), now.Format("0102"))
}

func nextWorkbenchProjectCode(projects []WorkbenchProjectView, now time.Time) string {
	prefix := workbenchProjectCodePrefix(now)
	next := 1
	for _, project := range projects {
		code := strings.TrimSpace(project.Code)
		if !strings.HasPrefix(code, prefix+"-") {
			continue
		}
		suffix := strings.TrimPrefix(code, prefix+"-")
		number, err := strconv.Atoi(suffix)
		if err != nil {
			continue
		}
		if number >= next {
			next = number + 1
		}
	}
	return fmt.Sprintf("%s-%02d", prefix, next)
}

func sortWorkbenchProjects(projects []WorkbenchProjectView) {
	sort.SliceStable(projects, func(i, j int) bool {
		return projects[i].UpdatedISO > projects[j].UpdatedISO
	})
}

func uniqueWorkbenchProjectID(base string, projects []WorkbenchProjectView) string {
	base = defaultString(strings.TrimSpace(base), "project")
	seen := map[string]struct{}{}
	for _, project := range projects {
		seen[project.ID] = struct{}{}
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

func clampInt(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func maxInt(value, min int) int {
	if value < min {
		return min
	}
	return value
}
