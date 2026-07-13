package skill

import "testing"

func TestStoreAllowedNamesRestrictsListAndRead(t *testing.T) {
	home := t.TempDir()
	writeSkill(t, home, ".voltui/skills/alpha/SKILL.md", "---\ndescription: alpha\n---\nalpha body")
	writeSkill(t, home, ".voltui/skills/beta/SKILL.md", "---\ndescription: beta\n---\nbeta body")

	store := New(Options{
		HomeDir:         home,
		DisableBuiltins: true,
		AllowedNames:    []string{" alpha ", "alpha"},
	})
	got := store.List()
	if len(got) != 1 || got[0].Name != "alpha" {
		t.Fatalf("allowed skills = %+v, want only alpha", got)
	}
	if _, ok := store.Read("beta"); ok {
		t.Fatal("Read exposed a skill outside the allowlist")
	}
}

func TestStoreEmptyAllowedNamesInheritsAllSkills(t *testing.T) {
	home := t.TempDir()
	writeSkill(t, home, ".voltui/skills/alpha/SKILL.md", "---\ndescription: alpha\n---\nalpha body")
	writeSkill(t, home, ".voltui/skills/beta/SKILL.md", "---\ndescription: beta\n---\nbeta body")

	store := New(Options{HomeDir: home, DisableBuiltins: true})
	if got := store.List(); len(got) != 2 {
		t.Fatalf("inherited skills = %+v, want alpha and beta", got)
	}
}
