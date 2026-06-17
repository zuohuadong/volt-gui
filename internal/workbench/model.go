package workbench

import "time"

const (
	StatusDraft           = "draft"
	StatusRunning         = "running"
	StatusWaitingApproval = "waiting_approval"
	StatusDone            = "done"
	StatusFailed          = "failed"
	StatusCanceled        = "canceled"
)

type Plugin struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Kind         string            `json:"kind"`
	Entry        string            `json:"entry"`
	Version      string            `json:"version,omitempty"`
	Capabilities []string          `json:"capabilities"`
	ProviderIDs  []string          `json:"providerIds,omitempty"`
	Config       map[string]string `json:"config,omitempty"`
	Enabled      bool              `json:"enabled"`
}

type Provider struct {
	ID           string            `json:"id"`
	Type         string            `json:"type"`
	Server       string            `json:"server,omitempty"`
	URL          string            `json:"url,omitempty"`
	Command      string            `json:"command,omitempty"`
	Args         []string          `json:"args,omitempty"`
	Capabilities []string          `json:"capabilities,omitempty"`
	HeaderKeys   []string          `json:"headerKeys,omitempty"`
	EnvKeys      []string          `json:"envKeys,omitempty"`
	Config       map[string]string `json:"config,omitempty"`
}

type CreateJobInput struct {
	PluginID   string            `json:"pluginId"`
	Kind       string            `json:"kind"`
	Scenario   string            `json:"scenario"`
	TemplateID string            `json:"templateId,omitempty"`
	Mode       string            `json:"mode,omitempty"`
	Steps      []CreateStepInput `json:"steps,omitempty"`
	Metadata   map[string]any    `json:"metadata,omitempty"`
}

type CreateStepInput struct {
	ID     string         `json:"id,omitempty"`
	Name   string         `json:"name"`
	Status string         `json:"status,omitempty"`
	Input  map[string]any `json:"input,omitempty"`
	Output map[string]any `json:"output,omitempty"`
}

type UpdateStepInput struct {
	Name   *string        `json:"name,omitempty"`
	Status string         `json:"status,omitempty"`
	Input  map[string]any `json:"input,omitempty"`
	Output map[string]any `json:"output,omitempty"`
	Error  *string        `json:"error,omitempty"`
}

type ArtifactInput struct {
	ID       string `json:"id,omitempty"`
	Kind     string `json:"kind"`
	Name     string `json:"name"`
	Path     string `json:"path"`
	MIMEType string `json:"mimeType,omitempty"`
}

type Job struct {
	ID          string         `json:"id"`
	PluginID    string         `json:"pluginId,omitempty"`
	Kind        string         `json:"kind"`
	Scenario    string         `json:"scenario"`
	TemplateID  string         `json:"templateId,omitempty"`
	Mode        string         `json:"mode"`
	CurrentStep string         `json:"currentStep,omitempty"`
	Steps       []Step         `json:"steps"`
	Artifacts   []Artifact     `json:"artifacts"`
	Status      string         `json:"status"`
	Metadata    map[string]any `json:"metadata,omitempty"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
}

type Step struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Status    string         `json:"status"`
	Input     map[string]any `json:"input,omitempty"`
	Output    map[string]any `json:"output,omitempty"`
	UpdatedAt time.Time      `json:"updatedAt"`
	Error     string         `json:"error,omitempty"`
}

type Artifact struct {
	ID        string    `json:"id"`
	Kind      string    `json:"kind"`
	Name      string    `json:"name"`
	Path      string    `json:"path"`
	MIMEType  string    `json:"mimeType,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}
