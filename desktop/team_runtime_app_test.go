package main

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	"voltui/internal/provider"
)

type scriptedTeamRuntimeProvider struct {
	replies []string
	err     error
	calls   int
}

func (p *scriptedTeamRuntimeProvider) Name() string { return "team-runtime-test" }

func (p *scriptedTeamRuntimeProvider) Stream(_ context.Context, _ provider.Request) (<-chan provider.Chunk, error) {
	ch := make(chan provider.Chunk, 2)
	if p.err != nil {
		ch <- provider.Chunk{Type: provider.ChunkError, Err: p.err}
		close(ch)
		return ch, nil
	}
	reply := "ok"
	if p.calls < len(p.replies) {
		reply = p.replies[p.calls]
	}
	p.calls++
	ch <- provider.Chunk{Type: provider.ChunkText, Text: reply}
	ch <- provider.Chunk{Type: provider.ChunkDone}
	close(ch)
	return ch, nil
}

func TestRunTeamRuntimePersistsAgentOutputs(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}
	prov := &scriptedTeamRuntimeProvider{replies: []string{"审查结论", "资料摘要"}}
	restore := newTeamRuntimeProvider
	newTeamRuntimeProvider = func(_ *App, modelRef string) (provider.Provider, string, error) {
		if modelRef != "test/model" {
			t.Fatalf("model ref not forwarded: %q", modelRef)
		}
		return prov, "test/model", nil
	}
	defer func() { newTeamRuntimeProvider = restore }()
	for _, agent := range []PersistentAgentInput{{ID: "code-review", Name: "审查员", Status: "已启用"}, {ID: "research", Name: "研究员", Status: "已启用"}} {
		if _, err := app.SaveAgent(agent); err != nil {
			t.Fatalf("SaveAgent: %v", err)
		}
	}

	room, err := app.SaveTeamRoom(WorkbenchTeamRoomView{Title: "真实 runtime 测试组", MemberIDs: []string{"code-review", "research"}, Avatars: []string{"C", "R"}})
	if err != nil {
		t.Fatalf("SaveTeamRoom: %v", err)
	}
	result, err := app.RunTeamRuntime(WorkbenchTeamRuntimeInput{TeamID: room.ID, Task: "请完成多 Agent 协作", ModelRef: "test/model"})
	if err != nil {
		t.Fatalf("RunTeamRuntime: %v", err)
	}
	if result.Run.Status != "completed" || len(result.Run.Events) < 5 {
		t.Fatalf("runtime did not complete with events: %+v", result.Run)
	}
	if len(result.Run.Artifacts) != 2 {
		t.Fatalf("runtime did not persist real artifacts: %+v", result.Run.Artifacts)
	}
	for _, artifact := range result.Run.Artifacts {
		if artifact.Path == "" || artifact.Status != "已写入" {
			t.Fatalf("artifact missing durable path/status: %+v", artifact)
		}
		if _, err := os.Stat(artifact.Path); err != nil {
			t.Fatalf("artifact file not written: %v", err)
		}
	}
	if result.Room.RunState != "已完成" {
		t.Fatalf("room state not updated: %+v", result.Room)
	}
	if !teamRuntimeTestHasMessage(result.Messages, "请完成多 Agent 协作") || !teamRuntimeTestHasMessage(result.Messages, "审查结论") || !teamRuntimeTestHasMessage(result.Messages, "资料摘要") {
		t.Fatalf("runtime messages missing expected content: %+v", result.Messages)
	}
	reloaded, err := app.ListWorkbenchData()
	if err != nil {
		t.Fatalf("ListWorkbenchData: %v", err)
	}
	if !containsTeamRun(reloaded.TeamRuns, result.Run.ID) || !teamRuntimeTestHasMessage(reloaded.TeamChatMessages, "审查结论") {
		t.Fatalf("runtime result was not persisted: runs=%+v messages=%+v", reloaded.TeamRuns, reloaded.TeamChatMessages)
	}
}

func TestRunTeamRuntimeRejectsEmptyModelOutput(t *testing.T) {
	provider := &scriptedTeamRuntimeProvider{replies: []string{""}}
	_, err := runTeamRuntimeAgent(context.Background(), provider, WorkbenchTeamRoomView{Title: "测试"}, PersistentAgentView{Name: "测试 Agent"}, "任务", nil, nil)
	if err == nil || !strings.Contains(err.Error(), "no visible content") {
		t.Fatalf("empty model output error = %v", err)
	}
}

func TestRunTeamRuntimeRecordsProviderFailures(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}
	restore := newTeamRuntimeProvider
	newTeamRuntimeProvider = func(_ *App, _ string) (provider.Provider, string, error) {
		return &scriptedTeamRuntimeProvider{err: errors.New("provider offline")}, "test/model", nil
	}
	defer func() { newTeamRuntimeProvider = restore }()
	if _, err := app.SaveAgent(PersistentAgentInput{ID: "code-review", Name: "审查员", Status: "已启用"}); err != nil {
		t.Fatalf("SaveAgent: %v", err)
	}

	room, err := app.SaveTeamRoom(WorkbenchTeamRoomView{Title: "失败 runtime 测试组", MemberIDs: []string{"code-review"}})
	if err != nil {
		t.Fatalf("SaveTeamRoom: %v", err)
	}
	result, err := app.RunTeamRuntime(WorkbenchTeamRuntimeInput{TeamID: room.ID, Task: "触发失败"})
	if err != nil {
		t.Fatalf("RunTeamRuntime should persist failed run instead of returning: %v", err)
	}
	if result.Run.Status != "stopped" {
		t.Fatalf("failed runtime should be stopped: %+v", result.Run)
	}
	if !teamRuntimeTestHasMessage(result.Messages, "provider offline") {
		t.Fatalf("failure message not persisted: %+v", result.Messages)
	}
}

func teamRuntimeTestHasMessage(messages []WorkbenchTeamChatMessageView, want string) bool {
	for _, message := range messages {
		if strings.Contains(message.Content, want) {
			return true
		}
	}
	return false
}
