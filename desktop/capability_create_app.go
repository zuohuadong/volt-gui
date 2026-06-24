package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"voltui/internal/config"
)

type WorkbenchPluginInput struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Kind         string            `json:"kind"`
	Entry        string            `json:"entry"`
	Version      string            `json:"version"`
	Capabilities []string          `json:"capabilities"`
	ProviderIDs  []string          `json:"providerIds"`
	Config       map[string]string `json:"config"`
	Enabled      bool              `json:"enabled"`
}

type SkillPackageInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	RunAs       string `json:"runAs"`
	Enabled     bool   `json:"enabled"`
}

func (a *App) SaveWorkbenchPlugin(input WorkbenchPluginInput) error {
	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = slugifyAgentID(input.Name)
	}
	if id == "" {
		return fmt.Errorf("plugin id is required")
	}
	enabled := input.Enabled
	entry := config.WorkbenchPluginEntry{
		ID:           id,
		Name:         defaultString(strings.TrimSpace(input.Name), id),
		Kind:         defaultString(strings.TrimSpace(input.Kind), "native"),
		Entry:        defaultString(strings.TrimSpace(input.Entry), id),
		Version:      defaultString(strings.TrimSpace(input.Version), "v0.1"),
		Capabilities: nonNil(input.Capabilities),
		ProviderIDs:  nonNil(input.ProviderIDs),
		Config:       cloneStringMap(input.Config),
		Enabled:      &enabled,
	}
	return a.applyConfigOnly(func(c *config.Config) error {
		for i := range c.Workbench.Plugins {
			if c.Workbench.Plugins[i].ID == entry.ID {
				c.Workbench.Plugins[i] = entry
				return nil
			}
		}
		c.Workbench.Plugins = append(c.Workbench.Plugins, entry)
		return nil
	})
}

func (a *App) CreateSkillPackage(input SkillPackageInput) (string, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return "", fmt.Errorf("skill name is required")
	}
	root := filepath.Join(filepath.Dir(config.UserConfigPath()), "skills", slugifyAgentID(name))
	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", err
	}
	body := fmt.Sprintf("# %s\n\n%s\n\n## Run As\n%s\n", name, strings.TrimSpace(input.Description), defaultString(strings.TrimSpace(input.RunAs), "workflow"))
	if err := os.WriteFile(filepath.Join(root, "SKILL.md"), []byte(body), 0o644); err != nil {
		return "", err
	}
	if err := a.AddSkillPath(root); err != nil {
		return "", err
	}
	if input.Enabled {
		_ = a.SetSkillEnabled(name, true)
	}
	return root, nil
}
