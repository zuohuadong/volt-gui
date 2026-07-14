//go:build bot

package main

import (
	"errors"

	"voltui/internal/bot"
)

var errRemoteTaskRuntimeNotStarted = errors.New("remote task runtime is not started")

func (a *App) remoteTaskGateway() (*bot.BotGateway, error) {
	if a == nil || a.botRuntime == nil {
		return nil, errRemoteTaskRuntimeNotStarted
	}
	a.botRuntime.mu.Lock()
	gw := a.botRuntime.gw
	a.botRuntime.mu.Unlock()
	if gw == nil || gw.RemoteTaskStore() == nil {
		return nil, errRemoteTaskRuntimeNotStarted
	}
	return gw, nil
}

func (a *App) ListRemoteBindings() ([]bot.RemoteBinding, error) {
	gw, err := a.remoteTaskGateway()
	if err != nil {
		return nil, err
	}
	return gw.RemoteTaskStore().ListBindings(), nil
}

func (a *App) ListRemoteTasks() ([]bot.RemoteTaskRecord, error) {
	gw, err := a.remoteTaskGateway()
	if err != nil {
		return nil, err
	}
	return gw.RemoteTaskStore().ListTasks(), nil
}

func (a *App) RemoteTask(taskID string) (bot.RemoteTaskRecord, error) {
	gw, err := a.remoteTaskGateway()
	if err != nil {
		return bot.RemoteTaskRecord{}, err
	}
	return gw.RemoteTaskStore().Task(taskID)
}

func (a *App) ListRemoteAudit() ([]bot.RemoteAuditEntry, error) {
	gw, err := a.remoteTaskGateway()
	if err != nil {
		return nil, err
	}
	return gw.RemoteTaskStore().ListAudit()
}

func (a *App) CancelRemoteTask(taskID string) (bot.RemoteTaskRecord, error) {
	gw, err := a.remoteTaskGateway()
	if err != nil {
		return bot.RemoteTaskRecord{}, err
	}
	return gw.CancelRemoteTask(taskID)
}

func (a *App) RevokeRemoteBinding(bindingID string) (bot.RemoteBinding, error) {
	gw, err := a.remoteTaskGateway()
	if err != nil {
		return bot.RemoteBinding{}, err
	}
	return gw.RevokeRemoteBinding(bindingID)
}
