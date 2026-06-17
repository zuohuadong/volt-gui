package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"golang.org/x/oauth2"

	"voltui/internal/config"
)

func TestAuthRecordRoundTripUsesPrivateFile(t *testing.T) {
	isolateDesktopUserDirs(t)
	cfg := testOIDCConfig()
	rec := tokenRecordFromOAuth(cfg, testOAuthToken(), UserInfo{Sub: "u_123", Email: "dev@example.com", Name: "Dev User"})

	if err := writeAuthRecord(rec); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(authRecordPath())
	if err != nil {
		t.Fatal(err)
	}
	if got := info.Mode().Perm(); got != authTokenFilePerm {
		t.Fatalf("auth token file mode = %o, want %o", got, authTokenFilePerm)
	}
	raw, err := os.ReadFile(authRecordPath())
	if err != nil {
		t.Fatal(err)
	}
	if json.Valid(raw) == false {
		t.Fatalf("auth token file is not json: %s", raw)
	}
	var decoded authTokenRecord
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.User.Email != "dev@example.com" || decoded.AccessToken == "" {
		t.Fatalf("decoded auth record = %+v", decoded)
	}
}

func TestNeedsAuthUsesConfiguredOIDCAndTokenRecord(t *testing.T) {
	isolateDesktopUserDirs(t)
	writeUserAuthConfig(t)
	app := NewApp()
	if !app.NeedsAuth() {
		t.Fatal("NeedsAuth() = false before token, want true")
	}

	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	rec := tokenRecordFromOAuth(cfg, testOAuthToken(), UserInfo{Sub: "sub-1", Email: "person@example.com", Name: "Person"})
	if err := writeAuthRecord(rec); err != nil {
		t.Fatal(err)
	}
	if app.NeedsAuth() {
		t.Fatal("NeedsAuth() = true after valid token, want false")
	}
	user := app.CurrentUser()
	if user == nil || user.Sub != "sub-1" || user.Email != "person@example.com" {
		t.Fatalf("CurrentUser() = %+v", user)
	}
	if err := app.Logout(); err != nil {
		t.Fatal(err)
	}
	if !app.NeedsAuth() {
		t.Fatal("NeedsAuth() = false after logout, want true")
	}
}

func TestOIDCCallbackAcceptsLoopbackStateAndCode(t *testing.T) {
	cfg := testOIDCConfig()
	listener, redirectURL, err := listenOIDCCallback(cfg)
	if err != nil {
		t.Fatal(err)
	}
	ch := serveOIDCCallback(t.Context(), listener, "state-1")

	resp, err := http.Get(redirectURL + "?state=state-1&code=code-1")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	got := <-ch
	if got.err != nil {
		t.Fatal(got.err)
	}
	if got.code != "code-1" {
		t.Fatalf("callback code = %q", got.code)
	}
}

func TestIsLoopbackRemote(t *testing.T) {
	for _, remote := range []string{"127.0.0.1:42000", "[::1]:42000"} {
		if !isLoopbackRemote(remote) {
			t.Fatalf("isLoopbackRemote(%q) = false", remote)
		}
	}
	if isLoopbackRemote("192.0.2.1:42000") {
		t.Fatal("non-loopback remote accepted")
	}
}

func writeUserAuthConfig(t *testing.T) {
	t.Helper()
	path := config.UserConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	body := []byte(`
[auth]
provider = "oidc"
issuer = "https://login.example.com"
client_id = "voltui-desktop"
`)
	if err := os.WriteFile(path, body, 0o644); err != nil {
		t.Fatal(err)
	}
}

func testOIDCConfig() *config.Config {
	cfg := config.Default()
	cfg.Auth.Provider = "oidc"
	cfg.Auth.Issuer = "https://login.example.com"
	cfg.Auth.ClientID = "voltui-desktop"
	return cfg
}

func testOAuthToken() *oauth2.Token {
	return &oauth2.Token{
		AccessToken:  "access-token",
		RefreshToken: "refresh-token",
		TokenType:    "Bearer",
		Expiry:       time.Now().Add(time.Hour),
	}
}
