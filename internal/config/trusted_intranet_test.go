package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTrustedIntranetSiteAddMatchRemoveAndRender(t *testing.T) {
	cfg := Default()
	changed, err := cfg.AddTrustedIntranetSite("LIMS.XIGU.ORG.", "192.168.1.14", 443)
	if err != nil {
		t.Fatalf("AddTrustedIntranetSite: %v", err)
	}
	if !changed {
		t.Fatal("first trusted intranet site add should report changed")
	}
	if !cfg.Network.TrustedIntranet.Enabled {
		t.Fatal("adding a trusted intranet site should enable the policy")
	}
	if got := cfg.Network.TrustedIntranet.Sites; len(got) != 1 || got[0].Host != "lims.xigu.org" || len(got[0].CIDRs) != 1 || got[0].CIDRs[0] != "192.168.1.14/32" || len(got[0].Ports) != 1 || got[0].Ports[0] != 443 {
		t.Fatalf("normalized sites = %#v", got)
	}
	for _, tc := range []struct {
		host string
		ip   string
		port int
		want bool
	}{
		{"lims.xigu.org", "192.168.1.14", 443, true},
		{"LIMS.XIGU.ORG.", "192.168.1.14", 443, true},
		{"lims.xigu.org", "192.168.1.15", 443, false},
		{"lims.xigu.org", "192.168.1.14", 80, false},
		{"other.xigu.org", "192.168.1.14", 443, false},
	} {
		if got := cfg.TrustedIntranetAllows(tc.host, tc.ip, tc.port); got != tc.want {
			t.Errorf("TrustedIntranetAllows(%q, %q, %d) = %v, want %v", tc.host, tc.ip, tc.port, got, tc.want)
		}
	}
	if changed, err := cfg.AddTrustedIntranetSite("lims.xigu.org", "192.168.1.14", 443); err != nil || changed {
		t.Fatalf("duplicate add = (%v, %v), want unchanged", changed, err)
	}
	if _, err := cfg.AddTrustedIntranetSite("metadata", "169.254.169.254", 80); err == nil {
		t.Fatal("link-local addresses must not be persistently trusted")
	}
	if _, err := normalizeTrustedIntranetSite(TrustedIntranetSiteConfig{Host: "too-broad.internal", CIDRs: []string{"10.0.0.0/1"}, Ports: []int{443}}); err == nil {
		t.Fatal("CIDRs broader than RFC1918/ULA space must be rejected")
	}

	rendered := RenderTOMLForScope(cfg, RenderScopeUser)
	for _, want := range []string{
		"[network.trusted_intranet]",
		"enabled = true",
		"[[network.trusted_intranet.sites]]",
		`host = "lims.xigu.org"`,
		`cidrs = ["192.168.1.14/32"]`,
		"ports = [443]",
	} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("rendered trusted intranet config missing %q:\n%s", want, rendered)
		}
	}

	site := cfg.Network.TrustedIntranet.Sites[0]
	if !cfg.RemoveTrustedIntranetSite(site) {
		t.Fatal("RemoveTrustedIntranetSite should remove the exact site")
	}
	if cfg.Network.TrustedIntranet.Enabled || len(cfg.Network.TrustedIntranet.Sites) != 0 {
		t.Fatalf("trusted intranet after removal = %#v", cfg.Network.TrustedIntranet)
	}
}

func TestProjectConfigCannotGrantTrustedIntranetAccess(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REASONIX_HOME", filepath.Join(home, "reasonix"))
	root := t.TempDir()
	project := `[network.trusted_intranet]
enabled = true

[[network.trusted_intranet.sites]]
host = "metadata.internal"
cidrs = ["192.168.1.0/24"]
ports = [80]
`
	if err := os.WriteFile(filepath.Join(root, "voltui.toml"), []byte(project), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := LoadForRoot(root)
	if err != nil {
		t.Fatalf("LoadForRoot: %v", err)
	}
	if cfg.TrustedIntranetAllows("metadata.internal", "192.168.1.14", 80) {
		t.Fatal("a project config must not grant trusted intranet access")
	}
}
