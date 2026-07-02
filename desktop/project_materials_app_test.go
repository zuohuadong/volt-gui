package main

import "testing"

func TestSaveProjectMaterialPersistsAndReloads(t *testing.T) {
	isolateDesktopUserDirs(t)

	app := &App{}
	saved, err := app.SaveProjectMaterial(WorkbenchProjectMaterialInput{
		ProjectID:   "volt-gui",
		ProjectName: "Volt GUI",
		Title:       "验收资料附件",
		Category:    "验收资料",
		Source:      "manual",
		Status:      "待复核",
		Desc:        "用于验证新增资料持久化。",
		FileName:    "acceptance.pdf",
		FilePath:    ".codex/attachments/acceptance.pdf",
		FileSize:    2048,
		MimeType:    "application/pdf",
	})
	if err != nil {
		t.Fatalf("SaveProjectMaterial() error = %v", err)
	}
	if saved.ID == "" {
		t.Fatal("SaveProjectMaterial() returned empty id")
	}
	if saved.ProjectID != "volt-gui" || saved.Title != "验收资料附件" {
		t.Fatalf("SaveProjectMaterial() returned unexpected material: %+v", saved)
	}

	reloaded, err := app.ListProjectMaterials()
	if err != nil {
		t.Fatalf("ListProjectMaterials() error = %v", err)
	}
	for _, material := range reloaded {
		if material.ID == saved.ID {
			if material.ProjectName != "Volt GUI" || material.Category != "验收资料" {
				t.Fatalf("reloaded material mismatch: %+v", material)
			}
			if material.FileName != "acceptance.pdf" || material.FileSize != 2048 || material.FilePath == "" {
				t.Fatalf("reloaded file metadata mismatch: %+v", material)
			}
			return
		}
	}
	t.Fatalf("saved material %q not found after reload", saved.ID)
}

func TestDeleteProjectMaterialRemovesPersistedItem(t *testing.T) {
	isolateDesktopUserDirs(t)

	app := &App{}
	saved, err := app.SaveProjectMaterial(WorkbenchProjectMaterialInput{
		ProjectID: "volt-gui",
		Title:     "待删除资料",
	})
	if err != nil {
		t.Fatalf("SaveProjectMaterial() error = %v", err)
	}
	if err := app.DeleteProjectMaterial(saved.ID); err != nil {
		t.Fatalf("DeleteProjectMaterial() error = %v", err)
	}

	reloaded, err := app.ListProjectMaterials()
	if err != nil {
		t.Fatalf("ListProjectMaterials() error = %v", err)
	}
	for _, material := range reloaded {
		if material.ID == saved.ID {
			t.Fatalf("deleted material still present: %+v", material)
		}
	}
}

func TestSaveProjectMaterialsBatchPersistsItems(t *testing.T) {
	isolateDesktopUserDirs(t)

	app := &App{}
	saved, err := app.SaveProjectMaterialsBatch([]WorkbenchProjectMaterialInput{
		{ProjectID: "volt-gui", ProjectName: "Volt GUI", Title: "批量资料一", Category: "需求资料", FileName: "one.md", FilePath: ".codex/attachments/one.md"},
		{ProjectID: "volt-gui", ProjectName: "Volt GUI", Title: "批量资料二", Category: "需求资料", FileName: "two.md", FilePath: ".codex/attachments/two.md"},
	})
	if err != nil {
		t.Fatalf("SaveProjectMaterialsBatch() error = %v", err)
	}
	if len(saved) != 2 {
		t.Fatalf("SaveProjectMaterialsBatch() returned %d items, want 2", len(saved))
	}

	reloaded, err := app.ListProjectMaterials()
	if err != nil {
		t.Fatalf("ListProjectMaterials() error = %v", err)
	}
	found := map[string]bool{}
	for _, material := range reloaded {
		for _, item := range saved {
			if material.ID == item.ID {
				found[item.ID] = true
			}
		}
	}
	for _, item := range saved {
		if !found[item.ID] {
			t.Fatalf("saved batch material %q not found after reload", item.ID)
		}
	}
}
