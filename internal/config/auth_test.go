package config

import (
	"strings"
	"testing"

	"github.com/BurntSushi/toml"
)

func TestAuthConfigDefaultsDisabled(t *testing.T) {
	cfg := Default()
	if cfg.AuthEnabled() {
		t.Fatal("default auth should be disabled")
	}
	if got := cfg.AuthScope(); got != "openid profile email" {
		t.Fatalf("AuthScope() = %q", got)
	}
	minPort, maxPort := cfg.AuthCallbackPorts()
	if minPort != 42000 || maxPort != 42099 {
		t.Fatalf("AuthCallbackPorts() = %d,%d", minPort, maxPort)
	}
}

func TestAuthConfigDecodesOIDC(t *testing.T) {
	cfg := Default()
	if _, err := toml.Decode(`
[auth]
provider = "oidc"
issuer = "https://login.example.com/"
client_id = "voltui-desktop"
callback_port_min = 43000
callback_port_max = 42999
`, cfg); err != nil {
		t.Fatal(err)
	}
	if !cfg.AuthEnabled() {
		t.Fatalf("AuthEnabled() = false, want true: %+v", cfg.Auth)
	}
	if got := cfg.AuthProvider(); got != "oidc" {
		t.Fatalf("AuthProvider() = %q", got)
	}
	minPort, maxPort := cfg.AuthCallbackPorts()
	if minPort != 43000 || maxPort != 43000 {
		t.Fatalf("inverted callback ports normalized to %d,%d", minPort, maxPort)
	}
}

func TestRenderTOMLOmitsAuthUntilConfigured(t *testing.T) {
	if got := RenderTOML(Default()); strings.Contains(got, "[auth]") {
		t.Fatalf("default render should omit auth section:\n%s", got)
	}
	cfg := Default()
	cfg.Auth.Provider = "oidc"
	cfg.Auth.Issuer = "https://login.example.com/"
	cfg.Auth.ClientID = "voltui-desktop"
	got := RenderTOML(cfg)
	for _, want := range []string{
		"[auth]",
		`provider = "oidc"`,
		`issuer = "https://login.example.com"`,
		`client_id = "voltui-desktop"`,
		`callback_port_min = 42000`,
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("rendered auth config missing %q:\n%s", want, got)
		}
	}
}
