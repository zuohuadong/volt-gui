//go:build !bot

package main

import (
	"errors"

	"voltui/internal/bot"
)

var errRemoteTaskRuntimeNotStarted = errors.New("remote task runtime is not included in this build")

func (a *App) ListRemoteBindings() ([]bot.RemoteBinding, error) {
	return nil, errRemoteTaskRuntimeNotStarted
}

func (a *App) ListRemoteTasks() ([]bot.RemoteTaskRecord, error) {
	return nil, errRemoteTaskRuntimeNotStarted
}

func (a *App) RemoteTask(string) (bot.RemoteTaskRecord, error) {
	return bot.RemoteTaskRecord{}, errRemoteTaskRuntimeNotStarted
}

func (a *App) ListRemoteAudit() ([]bot.RemoteAuditEntry, error) {
	return nil, errRemoteTaskRuntimeNotStarted
}

func (a *App) CancelRemoteTask(string) (bot.RemoteTaskRecord, error) {
	return bot.RemoteTaskRecord{}, errRemoteTaskRuntimeNotStarted
}

func (a *App) RevokeRemoteBinding(string) (bot.RemoteBinding, error) {
	return bot.RemoteBinding{}, errRemoteTaskRuntimeNotStarted
}
