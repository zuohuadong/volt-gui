package workbench

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type Store struct {
	root string
}

func NewStore(root string) *Store {
	return &Store{root: root}
}

func (s *Store) ListJobs() ([]Job, error) {
	entries, err := os.ReadDir(s.jobsDir())
	if errors.Is(err, os.ErrNotExist) {
		return []Job{}, nil
	}
	if err != nil {
		return nil, err
	}
	jobs := make([]Job, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		job, err := s.readJobFile(filepath.Join(s.jobsDir(), entry.Name()))
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}
	sort.Slice(jobs, func(i, j int) bool {
		return jobs[i].UpdatedAt.After(jobs[j].UpdatedAt)
	})
	return jobs, nil
}

func (s *Store) CreateJob(input CreateJobInput) (Job, error) {
	if strings.TrimSpace(input.Kind) == "" {
		return Job{}, errors.New("workbench job kind is required")
	}
	if strings.TrimSpace(input.Scenario) == "" {
		return Job{}, errors.New("workbench job scenario is required")
	}
	now := time.Now().UTC()
	mode := strings.TrimSpace(input.Mode)
	if mode == "" {
		mode = "manual"
	}
	steps := make([]Step, 0, len(input.Steps))
	for i, step := range input.Steps {
		id := cleanID(step.ID)
		if id == "" {
			id = fmt.Sprintf("step-%d", i+1)
		}
		name := strings.TrimSpace(step.Name)
		if name == "" {
			name = id
		}
		status := strings.TrimSpace(step.Status)
		if status == "" {
			status = StatusDraft
		}
		steps = append(steps, Step{
			ID:        id,
			Name:      name,
			Status:    status,
			Input:     cloneMap(step.Input),
			Output:    cloneMap(step.Output),
			UpdatedAt: now,
		})
	}
	if len(steps) == 0 {
		steps = append(steps, Step{ID: "draft", Name: "Draft", Status: StatusDraft, UpdatedAt: now})
	}
	job := Job{
		ID:          newID("job"),
		PluginID:    strings.TrimSpace(input.PluginID),
		Kind:        strings.TrimSpace(input.Kind),
		Scenario:    strings.TrimSpace(input.Scenario),
		TemplateID:  strings.TrimSpace(input.TemplateID),
		Mode:        mode,
		CurrentStep: steps[0].ID,
		Steps:       steps,
		Artifacts:   []Artifact{},
		Status:      StatusDraft,
		Metadata:    cloneMap(input.Metadata),
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := s.writeJob(job); err != nil {
		return Job{}, err
	}
	return job, nil
}

func (s *Store) GetJob(id string) (Job, error) {
	id = cleanID(id)
	if id == "" {
		return Job{}, errors.New("workbench job id is required")
	}
	return s.readJobFile(s.jobPath(id))
}

func (s *Store) UpdateStep(jobID, stepID string, patch UpdateStepInput) (Job, error) {
	job, err := s.GetJob(jobID)
	if err != nil {
		return Job{}, err
	}
	stepID = cleanID(stepID)
	if stepID == "" {
		return Job{}, errors.New("workbench step id is required")
	}
	now := time.Now().UTC()
	found := false
	for i := range job.Steps {
		if job.Steps[i].ID != stepID {
			continue
		}
		found = true
		if patch.Name != nil {
			job.Steps[i].Name = strings.TrimSpace(*patch.Name)
		}
		if status := strings.TrimSpace(patch.Status); status != "" {
			job.Steps[i].Status = status
		}
		if patch.Input != nil {
			job.Steps[i].Input = cloneMap(patch.Input)
		}
		if patch.Output != nil {
			job.Steps[i].Output = cloneMap(patch.Output)
		}
		if patch.Error != nil {
			job.Steps[i].Error = strings.TrimSpace(*patch.Error)
		}
		job.Steps[i].UpdatedAt = now
		break
	}
	if !found {
		return Job{}, fmt.Errorf("workbench step %q not found", stepID)
	}
	job.UpdatedAt = now
	job.recalculateStatus()
	if err := s.writeJob(job); err != nil {
		return Job{}, err
	}
	return job, nil
}

func (s *Store) ApproveStep(jobID, stepID string) (Job, error) {
	status := StatusDone
	return s.UpdateStep(jobID, stepID, UpdateStepInput{Status: status})
}

func (s *Store) AddArtifact(jobID string, input ArtifactInput) (Job, error) {
	job, err := s.GetJob(jobID)
	if err != nil {
		return Job{}, err
	}
	if strings.TrimSpace(input.Kind) == "" {
		return Job{}, errors.New("workbench artifact kind is required")
	}
	if strings.TrimSpace(input.Name) == "" {
		return Job{}, errors.New("workbench artifact name is required")
	}
	if strings.TrimSpace(input.Path) == "" {
		return Job{}, errors.New("workbench artifact path is required")
	}
	now := time.Now().UTC()
	id := cleanID(input.ID)
	if id == "" {
		id = newID("artifact")
	}
	job.Artifacts = append(job.Artifacts, Artifact{
		ID:        id,
		Kind:      strings.TrimSpace(input.Kind),
		Name:      strings.TrimSpace(input.Name),
		Path:      filepath.ToSlash(strings.TrimSpace(input.Path)),
		MIMEType:  strings.TrimSpace(input.MIMEType),
		CreatedAt: now,
	})
	job.UpdatedAt = now
	if err := s.writeJob(job); err != nil {
		return Job{}, err
	}
	return job, nil
}

func (s *Store) ArtifactDir(jobID string) (string, error) {
	id := cleanID(jobID)
	if id == "" {
		return "", errors.New("workbench job id is required")
	}
	dir := filepath.Join(s.root, "artifacts", id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

func (s *Store) readJobFile(path string) (Job, error) {
	body, err := os.ReadFile(path)
	if err != nil {
		return Job{}, err
	}
	var job Job
	if err := json.Unmarshal(body, &job); err != nil {
		return Job{}, err
	}
	if job.Artifacts == nil {
		job.Artifacts = []Artifact{}
	}
	if job.Steps == nil {
		job.Steps = []Step{}
	}
	return job, nil
}

func (s *Store) writeJob(job Job) error {
	if err := os.MkdirAll(s.jobsDir(), 0o755); err != nil {
		return err
	}
	body, err := json.MarshalIndent(job, "", "  ")
	if err != nil {
		return err
	}
	path := s.jobPath(job.ID)
	tmp, err := os.CreateTemp(filepath.Dir(path), ".job-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err := tmp.Write(body); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.WriteString("\n"); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}

func (s *Store) jobsDir() string {
	return filepath.Join(s.root, "jobs")
}

func (s *Store) jobPath(id string) string {
	return filepath.Join(s.jobsDir(), cleanID(id)+".json")
}

func (j *Job) recalculateStatus() {
	j.CurrentStep = ""
	anyFailed := false
	anyRunning := false
	allDone := len(j.Steps) > 0
	for _, step := range j.Steps {
		switch step.Status {
		case StatusFailed:
			anyFailed = true
		case StatusRunning:
			anyRunning = true
		case StatusDone:
		default:
			allDone = false
			if j.CurrentStep == "" {
				j.CurrentStep = step.ID
			}
		}
	}
	switch {
	case anyFailed:
		j.Status = StatusFailed
	case allDone:
		j.Status = StatusDone
	case anyRunning:
		j.Status = StatusRunning
	case j.CurrentStep != "":
		j.Status = StatusDraft
	default:
		j.Status = StatusDraft
	}
}

func cleanID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range id {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_', r == '.':
			b.WriteRune(r)
		}
	}
	return b.String()
}

func newID(prefix string) string {
	var b [6]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%s-%d", prefix, time.Now().UTC().UnixNano())
	}
	return fmt.Sprintf("%s-%s-%s", prefix, time.Now().UTC().Format("20060102150405"), hex.EncodeToString(b[:]))
}

func cloneMap(in map[string]any) map[string]any {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]any, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}
