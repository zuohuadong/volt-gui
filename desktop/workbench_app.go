package main

import (
	"path/filepath"
	"sort"
	"strings"

	"voltui/internal/config"
	"voltui/internal/workbench"
)

func (a *App) WorkbenchPlugins() []workbench.Plugin {
	cfg := a.workbenchConfig()
	out := make([]workbench.Plugin, 0, len(cfg.Workbench.Plugins))
	for _, p := range cfg.Workbench.Plugins {
		id := strings.TrimSpace(p.ID)
		if id == "" {
			continue
		}
		out = append(out, workbench.Plugin{
			ID:           id,
			Name:         p.Name,
			Kind:         p.Kind,
			Entry:        p.Entry,
			Version:      p.Version,
			Capabilities: nonNil(p.Capabilities),
			ProviderIDs:  nonNil(p.ProviderIDs),
			Config:       cloneStringMap(p.Config),
			Enabled:      p.IsEnabled(),
		})
	}
	return out
}

func (a *App) WorkbenchProviders() []workbench.Provider {
	cfg := a.workbenchConfig()
	out := make([]workbench.Provider, 0, len(cfg.Workbench.Providers))
	for _, p := range cfg.Workbench.Providers {
		id := strings.TrimSpace(p.ID)
		if id == "" {
			continue
		}
		out = append(out, workbench.Provider{
			ID:           id,
			Type:         p.Type,
			Server:       p.Server,
			URL:          p.URL,
			Command:      p.Command,
			Args:         nonNil(p.Args),
			Capabilities: nonNil(p.Capabilities),
			HeaderKeys:   sortedKeys(p.Headers),
			EnvKeys:      sortedKeys(p.Env),
			Config:       cloneStringMap(p.Config),
		})
	}
	return out
}

func (a *App) ListWorkbenchJobs() []workbench.Job {
	jobs, err := a.workbenchStore().ListJobs()
	if err != nil {
		return []workbench.Job{}
	}
	return jobs
}

func (a *App) CreateWorkbenchJob(input workbench.CreateJobInput) (workbench.Job, error) {
	return a.workbenchStore().CreateJob(input)
}

func (a *App) GetWorkbenchJob(id string) (workbench.Job, error) {
	return a.workbenchStore().GetJob(id)
}

func (a *App) UpdateWorkbenchStep(jobID, stepID string, patch workbench.UpdateStepInput) (workbench.Job, error) {
	return a.workbenchStore().UpdateStep(jobID, stepID, patch)
}

func (a *App) ApproveWorkbenchStep(jobID, stepID string) (workbench.Job, error) {
	return a.workbenchStore().ApproveStep(jobID, stepID)
}

func (a *App) AddWorkbenchArtifact(jobID string, artifact workbench.ArtifactInput) (workbench.Job, error) {
	return a.workbenchStore().AddArtifact(jobID, artifact)
}

func (a *App) WorkbenchArtifactDir(jobID string) (string, error) {
	return a.workbenchStore().ArtifactDir(jobID)
}

func (a *App) workbenchConfig() *config.Config {
	cfg, err := config.LoadForRoot(a.activeWorkspaceRoot())
	if err != nil || cfg == nil {
		return config.Default()
	}
	return cfg
}

func (a *App) workbenchStore() *workbench.Store {
	root := strings.TrimSpace(a.activeWorkspaceRoot())
	if root == "" {
		root = "."
	}
	if abs, err := filepath.Abs(root); err == nil {
		root = abs
	}
	return workbench.NewStore(filepath.Join(root, ".voltui", "workbench"))
}

func sortedKeys(values map[string]string) []string {
	if len(values) == 0 {
		return []string{}
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func cloneStringMap(in map[string]string) map[string]string {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]string, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}
