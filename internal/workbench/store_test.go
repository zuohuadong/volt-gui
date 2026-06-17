package workbench

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStoreCreatesUpdatesAndListsJobs(t *testing.T) {
	store := NewStore(t.TempDir())

	job, err := store.CreateJob(CreateJobInput{
		PluginID:   "content-studio",
		Kind:       "presentation",
		Scenario:   "产品发布",
		TemplateID: "launch",
		Mode:       "manual",
		Steps: []CreateStepInput{
			{ID: "outline", Name: "Outline"},
			{ID: "layout", Name: "Layout"},
			{ID: "visuals", Name: "Visuals"},
		},
		Metadata: map[string]any{"audience": "enterprise"},
	})
	if err != nil {
		t.Fatalf("CreateJob: %v", err)
	}
	if job.ID == "" || job.CurrentStep != "outline" || len(job.Steps) != 3 {
		t.Fatalf("job not initialized correctly: %+v", job)
	}

	title := "Approved outline"
	job, err = store.UpdateStep(job.ID, "outline", UpdateStepInput{
		Name:   &title,
		Status: StatusDone,
		Output: map[string]any{"slides": float64(12)},
	})
	if err != nil {
		t.Fatalf("UpdateStep: %v", err)
	}
	if job.Steps[0].Name != title || job.Steps[0].Output["slides"] != float64(12) {
		t.Fatalf("step patch not applied: %+v", job.Steps[0])
	}
	if job.CurrentStep != "layout" || job.Status != StatusDraft {
		t.Fatalf("job progress = step:%q status:%q, want layout/draft", job.CurrentStep, job.Status)
	}

	job, err = store.AddArtifact(job.ID, ArtifactInput{Kind: "pptx", Name: "deck.pptx", Path: filepath.Join("outputs", "deck.pptx"), MIMEType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"})
	if err != nil {
		t.Fatalf("AddArtifact: %v", err)
	}
	if len(job.Artifacts) != 1 || job.Artifacts[0].Path != "outputs/deck.pptx" {
		t.Fatalf("artifact not preserved: %+v", job.Artifacts)
	}

	got, err := store.GetJob(job.ID)
	if err != nil {
		t.Fatalf("GetJob: %v", err)
	}
	if got.ID != job.ID || len(got.Artifacts) != 1 {
		t.Fatalf("persisted job mismatch: %+v", got)
	}
	jobs, err := store.ListJobs()
	if err != nil {
		t.Fatalf("ListJobs: %v", err)
	}
	if len(jobs) != 1 || jobs[0].ID != job.ID {
		t.Fatalf("ListJobs = %+v", jobs)
	}
	dir, err := store.ArtifactDir(job.ID)
	if err != nil {
		t.Fatalf("ArtifactDir: %v", err)
	}
	if st, err := os.Stat(dir); err != nil || !st.IsDir() {
		t.Fatalf("artifact dir not created: stat=%+v err=%v", st, err)
	}
}

func TestStoreRejectsInvalidJobs(t *testing.T) {
	store := NewStore(t.TempDir())
	if _, err := store.CreateJob(CreateJobInput{Scenario: "missing kind"}); err == nil {
		t.Fatal("CreateJob without kind should fail")
	}
	if _, err := store.CreateJob(CreateJobInput{Kind: "presentation"}); err == nil {
		t.Fatal("CreateJob without scenario should fail")
	}
	if _, err := store.UpdateStep("missing", "outline", UpdateStepInput{Status: StatusDone}); err == nil {
		t.Fatal("UpdateStep on missing job should fail")
	}
}
