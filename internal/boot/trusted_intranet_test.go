package boot

import (
	"net"
	"path/filepath"
	"testing"

	"voltui/internal/config"
	"voltui/internal/tool"
)

func TestRememberTrustedIntranetWritesExactUserGlobalRuleAndMapsRuntimePolicy(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REASONIX_HOME", filepath.Join(home, "reasonix"))
	req := tool.TrustedIntranetRequest{URL: "https://lims.xigu.org/workshop", Host: "LIMS.XIGU.ORG.", IP: "192.168.1.14", Port: 443}
	result := rememberTrustedIntranet(req)
	if result.Err != nil || !result.Saved || result.Path != config.UserConfigPath() {
		t.Fatalf("rememberTrustedIntranet = %+v", result)
	}
	cfg := config.LoadForViewWithoutCredentials(config.UserConfigPath())
	if !cfg.TrustedIntranetAllows("lims.xigu.org", "192.168.1.14", 443) {
		t.Fatalf("saved config does not allow exact target: %#v", cfg.Network.TrustedIntranet)
	}
	if cfg.TrustedIntranetAllows("lims.xigu.org", "192.168.1.15", 443) || cfg.TrustedIntranetAllows("lims.xigu.org", "192.168.1.14", 80) {
		t.Fatal("saved trusted intranet rule is broader than host + exact IP + port")
	}
	duplicate := rememberTrustedIntranet(req)
	if duplicate.Err != nil || duplicate.Saved || duplicate.CoveredBy == "" {
		t.Fatalf("duplicate remember = %+v, want already covered", duplicate)
	}

	policy := trustedIntranetPolicy(cfg)
	if !policy.Allows("lims.xigu.org", net.ParseIP("192.168.1.14"), 443) {
		t.Fatalf("runtime policy did not map saved config: %#v", policy)
	}
}
