package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"voltui/internal/knowledge"
)

func TestTraeExternalDataAdapterPreviewsCompatibleWarningsAndUnsupported(t *testing.T) {
	root := t.TempDir()
	workspace := t.TempDir()
	globalSkills := filepath.Join(t.TempDir(), "skills")

	writeExternalTestFile(t, filepath.Join(root, "memory", "user_profile.md"), "偏好使用中文回答。")
	writeExternalTestFile(t, filepath.Join(root, "memory", "projects", "demo", "project_memory.md"), "项目使用 Go 和 Svelte。")
	writeExternalTestFile(t, filepath.Join(root, "memory", "projects", "demo", "session_memory_01.jsonl"), `{"intent":"修复导入","learned":["先预览再写入"],"outcome":"完成"}`+"\n")
	writeExternalTestFile(t, filepath.Join(root, "skills", "review", "SKILL.md"), "---\ndescription: review\n---\n检查代码。")
	writeExternalTestFile(t, filepath.Join(root, "skills", "review", "references", "guide.md"), "review guide")
	writeExternalTestFile(t, filepath.Join(root, "knowledge.db"), "sqlite placeholder")

	candidates, messages, err := (traeExternalDataAdapter{}).scan(root, workspace, globalSkills)
	if err != nil {
		t.Fatalf("scan TRAE data: %v", err)
	}
	if len(messages) != 0 {
		t.Fatalf("unexpected scan messages: %v", messages)
	}
	if len(candidates) != 5 {
		t.Fatalf("candidate count = %d, want 5: %+v", len(candidates), candidates)
	}

	var compatible, warning, incompatible int
	var sessionDefaultSelected bool
	for _, candidate := range candidates {
		switch candidate.View.Compatibility {
		case externalCompatibilityCompatible:
			compatible++
		case externalCompatibilityWarning:
			warning++
			if candidate.View.Category == "会话摘要" {
				sessionDefaultSelected = candidate.View.SelectedByDefault
			}
		case externalCompatibilityIncompatible:
			incompatible++
		}
	}
	if compatible != 3 || warning != 1 || incompatible != 1 {
		t.Fatalf("compatibility counts = %d/%d/%d, want 3/1/1", compatible, warning, incompatible)
	}
	if sessionDefaultSelected {
		t.Fatal("session summary must require explicit selection")
	}
	if got := findExternalCandidateByCategory(candidates, "技能"); got == nil || got.View.TargetLabel != "Volt 全局技能" {
		t.Fatalf("global skill candidate = %+v", got)
	}
	if got := findExternalCandidateByCategory(candidates, "不兼容"); got == nil || !strings.Contains(got.View.Warning, "私有知识数据库") {
		t.Fatalf("database incompatibility = %+v", got)
	}
}

func TestFolderExternalDataAdapterSupportsDocumentsAndFlagsDatabases(t *testing.T) {
	root := t.TempDir()
	workspace := t.TempDir()
	writeExternalTestFile(t, filepath.Join(root, "docs", "guide.md"), "# Guide\n\nImport me.")
	writeExternalTestFile(t, filepath.Join(root, "portable-skill", "SKILL.md"), "---\ndescription: portable\n---\nbody")
	writeExternalTestFile(t, filepath.Join(root, "private.sqlite"), "not a portable database")

	candidates, _, err := (folderExternalDataAdapter{}).scan(root, workspace, filepath.Join(t.TempDir(), "skills"))
	if err != nil {
		t.Fatalf("scan folder: %v", err)
	}
	if len(candidates) != 3 {
		t.Fatalf("candidate count = %d, want 3", len(candidates))
	}
	if got := findExternalCandidateByCategory(candidates, "文档"); got == nil || got.View.Target != externalTargetKnowledge {
		t.Fatalf("document candidate = %+v", got)
	}
	if got := findExternalCandidateByCategory(candidates, "技能"); got == nil || got.View.TargetLabel != "Volt 项目技能" {
		t.Fatalf("skill candidate = %+v", got)
	}
	if got := findExternalCandidateByCategory(candidates, "不兼容"); got == nil || got.View.Target != externalTargetNone {
		t.Fatalf("database candidate = %+v", got)
	}
}

func TestTraeExternalDataAdapterScansProjectRulesAndSkills(t *testing.T) {
	project := t.TempDir()
	workspace := t.TempDir()
	writeExternalTestFile(t, filepath.Join(project, ".trae", "rules", "go-style.md"), "---\nalwaysApply: true\n---\n使用 gofmt。")
	writeExternalTestFile(t, filepath.Join(project, ".trae", "skills", "release", "SKILL.md"), "---\ndescription: release\n---\n发布前运行测试。")

	candidates, messages, err := (traeExternalDataAdapter{}).scan(project, workspace, filepath.Join(t.TempDir(), "skills"))
	if err != nil {
		t.Fatalf("scan project TRAE data: %v", err)
	}
	if len(messages) != 0 {
		t.Fatalf("unexpected messages: %v", messages)
	}
	if len(candidates) != 2 {
		t.Fatalf("candidate count = %d, want 2", len(candidates))
	}
	if got := findExternalCandidateByCategory(candidates, "规则"); got == nil || got.View.Target != externalTargetKnowledge {
		t.Fatalf("rule candidate = %+v", got)
	}
	if got := findExternalCandidateByCategory(candidates, "技能"); got == nil || got.View.TargetLabel != "Volt 项目技能" {
		t.Fatalf("project skill candidate = %+v", got)
	}
}

func TestTraeExternalDataAdapterPrioritizesDurableDataBeforeSessionHistory(t *testing.T) {
	root := t.TempDir()
	for index := 0; index < maxExternalSessionItems+5; index++ {
		writeExternalTestFile(t, filepath.Join(root, "memory", "projects", "demo", fmt.Sprintf("session_memory_%03d.jsonl", index)), `{"intent":"history"}`+"\n")
	}
	writeExternalTestFile(t, filepath.Join(root, "skills", "portable", "SKILL.md"), "---\ndescription: portable\n---\nbody")

	candidates, messages, err := (traeExternalDataAdapter{}).scan(root, t.TempDir(), filepath.Join(t.TempDir(), "skills"))
	if err != nil {
		t.Fatalf("scan large TRAE history: %v", err)
	}
	if got := findExternalCandidateByCategory(candidates, "技能"); got == nil {
		t.Fatal("durable skill was crowded out by session history")
	}
	if len(candidates) != maxExternalSessionItems+1 {
		t.Fatalf("candidate count = %d, want %d", len(candidates), maxExternalSessionItems+1)
	}
	if !strings.Contains(strings.Join(messages, "\n"), "会话摘要最多显示") {
		t.Fatalf("missing session truncation warning: %v", messages)
	}
}

func TestFolderExternalDataAdapterRejectsSymlinkDocumentsAndSkillEntrypoints(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	workspace := t.TempDir()
	writeExternalTestFile(t, filepath.Join(outside, "secret.md"), "outside document")
	writeExternalTestFile(t, filepath.Join(outside, "SKILL.md"), "---\ndescription: outside\n---\nbody")
	if err := os.MkdirAll(filepath.Join(root, "skill-link"), 0o755); err != nil {
		t.Fatalf("mkdir skill-link: %v", err)
	}
	if err := os.Symlink(filepath.Join(outside, "secret.md"), filepath.Join(root, "linked.md")); err != nil {
		t.Skipf("symlink is unavailable: %v", err)
	}
	if err := os.Symlink(filepath.Join(outside, "SKILL.md"), filepath.Join(root, "skill-link", "SKILL.md")); err != nil {
		t.Skipf("symlink is unavailable: %v", err)
	}

	candidates, _, err := (folderExternalDataAdapter{}).scan(root, workspace, filepath.Join(t.TempDir(), "skills"))
	if err != nil {
		t.Fatalf("scan symlink folder: %v", err)
	}
	if len(candidates) != 2 {
		t.Fatalf("candidate count = %d, want 2: %+v", len(candidates), candidates)
	}
	for _, candidate := range candidates {
		if candidate.View.Compatibility != externalCompatibilityIncompatible || candidate.View.SelectedByDefault {
			t.Fatalf("symlink candidate must be incompatible: %+v", candidate)
		}
		if !strings.Contains(candidate.View.Warning, "符号链接") {
			t.Fatalf("missing symlink explanation: %+v", candidate)
		}
	}
}

func TestLoadExternalCandidateContentRejectsFileChangedToSymlink(t *testing.T) {
	root := t.TempDir()
	outside := filepath.Join(t.TempDir(), "outside.md")
	path := filepath.Join(root, "guide.md")
	writeExternalTestFile(t, path, "safe content")
	writeExternalTestFile(t, outside, "outside content")
	candidate, err := newExternalDocumentCandidate(externalDataSourceFolder, "本地文件夹", "文档", root, path, externalCompatibilityCompatible, "", externalContentFile)
	if err != nil {
		t.Fatalf("create candidate: %v", err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove source: %v", err)
	}
	if err := os.Symlink(outside, path); err != nil {
		t.Skipf("symlink is unavailable: %v", err)
	}

	if _, err := loadExternalCandidateContent(candidate); err == nil || !strings.Contains(err.Error(), "符号链接") {
		t.Fatalf("load error = %v, want symlink rejection", err)
	}
}

func TestExecuteExternalDataImportIndexesDocumentsCopiesSkillsAndSkipsDuplicates(t *testing.T) {
	root := t.TempDir()
	workspace := t.TempDir()
	globalSkills := filepath.Join(t.TempDir(), "skills")
	writeExternalTestFile(t, filepath.Join(root, "memory", "user_profile.md"), "用户偏好：所有回答使用中文。")
	writeExternalTestFile(t, filepath.Join(root, "skills", "review", "SKILL.md"), "---\ndescription: review\n---\n检查导入结果。")
	writeExternalTestFile(t, filepath.Join(root, "skills", "review", "scripts", "verify.sh"), "#!/bin/sh\necho ok\n")

	candidates, _, err := (traeExternalDataAdapter{}).scan(root, workspace, globalSkills)
	if err != nil {
		t.Fatalf("scan: %v", err)
	}
	selected := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		if candidate.View.Compatibility != externalCompatibilityIncompatible {
			selected = append(selected, candidate.View.ID)
		}
	}

	store, err := knowledge.Open(filepath.Join(t.TempDir(), "knowledge.db"))
	if err != nil {
		t.Fatalf("open knowledge store: %v", err)
	}
	defer store.Close()

	result := executeExternalDataImport(candidates, selected, store, nil)
	if result.Imported != 2 || result.Skipped != 0 || result.Failed != 0 {
		t.Fatalf("first result = %+v", result)
	}
	search, err := store.Search(context.Background(), "中文", knowledge.SearchOptions{Limit: 5})
	if err != nil {
		t.Fatalf("search imported knowledge: %v", err)
	}
	if len(search) == 0 || !strings.Contains(search[0].Snippet, "中文") {
		t.Fatalf("search results = %+v", search)
	}
	if _, err := os.Stat(filepath.Join(globalSkills, "review", "scripts", "verify.sh")); err != nil {
		t.Fatalf("copied skill package: %v", err)
	}

	second := executeExternalDataImport(candidates, selected, store, nil)
	if second.Imported != 0 || second.Skipped != 2 || second.Failed != 0 {
		t.Fatalf("second result = %+v", second)
	}
}

func TestExternalDataImportJobCancelsAndReleasesItsSlot(t *testing.T) {
	app := &App{}
	ctx, finish, err := app.beginExternalDataImport()
	if err != nil {
		t.Fatalf("begin import job: %v", err)
	}
	if !app.CancelExternalDataImport() {
		t.Fatal("CancelExternalDataImport should report an active job")
	}
	select {
	case <-ctx.Done():
		if !errors.Is(ctx.Err(), context.Canceled) {
			t.Fatalf("cancelled context error = %v, want context.Canceled", ctx.Err())
		}
	default:
		t.Fatal("cancel should signal the import context")
	}
	finish()
	if app.CancelExternalDataImport() {
		t.Fatal("finished import job must not remain cancellable")
	}
}

func TestExecuteExternalDataImportContextStopsBeforeWriting(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	result, err := executeExternalDataImportContext(ctx, nil, []string{"missing"}, nil, nil)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled import error = %v, want context.Canceled", err)
	}
	if result.Imported != 0 || result.Skipped != 0 || result.Failed != 0 || len(result.Items) != 0 {
		t.Fatalf("cancelled import should not record writes: %+v", result)
	}
}

func TestExtractTraeSessionSummaryKeepsOnlyPortableSummaryFields(t *testing.T) {
	path := filepath.Join(t.TempDir(), "session_memory.jsonl")
	writeExternalTestFile(t, path, `{"message_id":"secret-id","intent":"实现通用导入","learned":["不覆盖同名技能"],"outcome":"通过测试","actions":["扫描","预览"]}`+"\n")

	text, err := extractTraeSessionSummary(path)
	if err != nil {
		t.Fatalf("extract session: %v", err)
	}
	for _, expected := range []string{"实现通用导入", "不覆盖同名技能", "通过测试", "扫描"} {
		if !strings.Contains(text, expected) {
			t.Fatalf("summary %q missing %q", text, expected)
		}
	}
	if strings.Contains(text, "secret-id") {
		t.Fatalf("summary leaked message id: %q", text)
	}
}

func writeExternalTestFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func findExternalCandidateByCategory(candidates []externalDataCandidate, category string) *externalDataCandidate {
	for i := range candidates {
		if candidates[i].View.Category == category {
			return &candidates[i]
		}
	}
	return nil
}
