package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/oauth2"

	"voltui/internal/config"
)

const (
	authTokenFile      = "auth.json"
	oidcCallbackPath   = "/auth/callback"
	oidcLoginTimeout   = 5 * time.Minute
	authTokenFilePerm  = 0o600
	authTokenDirPerm   = 0o700
	defaultOIDCMinPort = 42000
	defaultOIDCMaxPort = 42099
)

// UserInfo is the stable, non-secret identity surface exposed to the frontend
// and telemetry. It intentionally mirrors OIDC claims without exposing tokens.
type UserInfo struct {
	Sub   string `json:"sub"`
	Email string `json:"email,omitempty"`
	Name  string `json:"name,omitempty"`
}

type authTokenRecord struct {
	Provider     string    `json:"provider"`
	Issuer       string    `json:"issuer"`
	ClientID     string    `json:"clientId"`
	AccessToken  string    `json:"accessToken"`
	RefreshToken string    `json:"refreshToken,omitempty"`
	TokenType    string    `json:"tokenType,omitempty"`
	Expiry       time.Time `json:"expiry"`
	User         UserInfo  `json:"user"`
}

type oidcClaims struct {
	Subject       string `json:"sub"`
	Email         string `json:"email"`
	Name          string `json:"name"`
	PreferredName string `json:"preferred_username"`
	GivenName     string `json:"given_name"`
	FamilyName    string `json:"family_name"`
}

func (a *App) NeedsAuth() bool {
	cfg, err := config.Load()
	if err != nil || !cfg.AuthConfigured() {
		return false
	}
	if !cfg.AuthEnabled() {
		return true
	}
	_, err = a.validAuthRecord(cfg)
	return err != nil
}

func (a *App) CurrentUser() *UserInfo {
	cfg, err := config.Load()
	if err != nil || !cfg.AuthEnabled() {
		return nil
	}
	rec, err := a.validAuthRecord(cfg)
	if err != nil || strings.TrimSpace(rec.User.Sub) == "" {
		return nil
	}
	user := rec.User
	return &user
}

func (a *App) Logout() error {
	if err := os.Remove(authRecordPath()); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func (a *App) CancelOIDCLogin() {
	a.authMu.Lock()
	cancel := a.authCancel
	a.authMu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (a *App) StartOIDCLogin() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if !cfg.AuthEnabled() {
		return fmt.Errorf("oidc auth is not configured")
	}

	ctx, cancel := context.WithTimeout(a.bootContext(), oidcLoginTimeout)
	defer cancel()
	if err := a.setOIDCLoginCancel(cancel); err != nil {
		return err
	}
	defer a.clearOIDCLoginCancel()

	issuer := strings.TrimRight(strings.TrimSpace(cfg.Auth.Issuer), "/")
	provider, err := oidc.NewProvider(ctx, issuer)
	if err != nil {
		return fmt.Errorf("discover issuer: %w", err)
	}
	state, err := randomURLToken(32)
	if err != nil {
		return err
	}
	nonce, err := randomURLToken(32)
	if err != nil {
		return err
	}
	verifier := oauth2.GenerateVerifier()

	listener, redirectURL, err := listenOIDCCallback(cfg)
	if err != nil {
		return err
	}
	defer listener.Close()

	oauthCfg := oidcOAuthConfig(cfg, provider, redirectURL)
	resultCh := serveOIDCCallback(ctx, listener, state)
	authURL := oauthCfg.AuthCodeURL(
		state,
		oauth2.AccessTypeOffline,
		oauth2.S256ChallengeOption(verifier),
		oidc.Nonce(nonce),
	)
	if err := a.openAuthURL(authURL); err != nil {
		return err
	}

	result := <-resultCh
	if result.err != nil {
		return result.err
	}
	token, err := oauthCfg.Exchange(ctx, result.code, oauth2.VerifierOption(verifier))
	if err != nil {
		return fmt.Errorf("exchange code: %w", err)
	}
	user, err := verifyOIDCToken(ctx, provider, cfg, token, nonce)
	if err != nil {
		return err
	}
	rec := tokenRecordFromOAuth(cfg, token, user)
	if err := writeAuthRecord(rec); err != nil {
		return fmt.Errorf("save auth token: %w", err)
	}
	if err := a.rebuild(); err != nil {
		return err
	}
	return nil
}

func (a *App) setOIDCLoginCancel(cancel context.CancelFunc) error {
	a.authMu.Lock()
	defer a.authMu.Unlock()
	if a.authCancel != nil {
		return fmt.Errorf("oidc login already in progress")
	}
	a.authCancel = cancel
	return nil
}

func (a *App) clearOIDCLoginCancel() {
	a.authMu.Lock()
	defer a.authMu.Unlock()
	a.authCancel = nil
}

func (a *App) validAuthRecord(cfg *config.Config) (*authTokenRecord, error) {
	rec, err := readAuthRecord()
	if err != nil {
		return nil, err
	}
	if !authRecordMatchesConfig(rec, cfg) {
		return nil, fmt.Errorf("auth token does not match current issuer/client")
	}
	if strings.TrimSpace(rec.User.Sub) == "" {
		return nil, fmt.Errorf("auth token has no subject")
	}
	if rec.oauthToken().Valid() {
		return rec, nil
	}
	if strings.TrimSpace(rec.RefreshToken) == "" {
		return nil, fmt.Errorf("auth token expired")
	}
	refreshed, err := refreshAuthRecord(a.bootContext(), cfg, rec)
	if err != nil {
		return nil, err
	}
	if err := writeAuthRecord(refreshed); err != nil {
		return nil, err
	}
	return refreshed, nil
}

func oidcOAuthConfig(cfg *config.Config, provider *oidc.Provider, redirectURL string) oauth2.Config {
	return oauth2.Config{
		ClientID:    strings.TrimSpace(cfg.Auth.ClientID),
		Endpoint:    provider.Endpoint(),
		RedirectURL: redirectURL,
		Scopes:      strings.Fields(cfg.AuthScope()),
	}
}

func refreshAuthRecord(ctx context.Context, cfg *config.Config, rec *authTokenRecord) (*authTokenRecord, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	provider, err := oidc.NewProvider(ctx, strings.TrimRight(strings.TrimSpace(cfg.Auth.Issuer), "/"))
	if err != nil {
		return nil, fmt.Errorf("discover issuer: %w", err)
	}
	oauthCfg := oidcOAuthConfig(cfg, provider, "")
	token, err := oauthCfg.TokenSource(ctx, rec.oauthToken()).Token()
	if err != nil {
		return nil, fmt.Errorf("refresh token: %w", err)
	}
	user := rec.User
	if rawID, _ := token.Extra("id_token").(string); rawID != "" {
		verified, err := provider.Verifier(&oidc.Config{ClientID: strings.TrimSpace(cfg.Auth.ClientID)}).Verify(ctx, rawID)
		if err != nil {
			return nil, fmt.Errorf("verify refreshed id_token: %w", err)
		}
		user, err = userInfoFromIDToken(verified)
		if err != nil {
			return nil, err
		}
	}
	return tokenRecordFromOAuth(cfg, token, user), nil
}

func verifyOIDCToken(ctx context.Context, provider *oidc.Provider, cfg *config.Config, token *oauth2.Token, nonce string) (UserInfo, error) {
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || strings.TrimSpace(rawIDToken) == "" {
		return UserInfo{}, fmt.Errorf("token response missing id_token")
	}
	idToken, err := provider.Verifier(&oidc.Config{ClientID: strings.TrimSpace(cfg.Auth.ClientID)}).Verify(ctx, rawIDToken, oidc.Nonce(nonce))
	if err != nil {
		return UserInfo{}, fmt.Errorf("verify id_token: %w", err)
	}
	return userInfoFromIDToken(idToken)
}

func userInfoFromIDToken(idToken *oidc.IDToken) (UserInfo, error) {
	var claims oidcClaims
	if err := idToken.Claims(&claims); err != nil {
		return UserInfo{}, fmt.Errorf("read id_token claims: %w", err)
	}
	user := UserInfo{
		Sub:   strings.TrimSpace(claims.Subject),
		Email: strings.TrimSpace(claims.Email),
		Name:  strings.TrimSpace(claims.Name),
	}
	if user.Name == "" {
		user.Name = strings.TrimSpace(claims.PreferredName)
	}
	if user.Name == "" {
		user.Name = strings.TrimSpace(strings.Join([]string{claims.GivenName, claims.FamilyName}, " "))
	}
	if user.Sub == "" {
		return UserInfo{}, fmt.Errorf("id_token missing subject")
	}
	return user, nil
}

func tokenRecordFromOAuth(cfg *config.Config, token *oauth2.Token, user UserInfo) *authTokenRecord {
	return &authTokenRecord{
		Provider:     "oidc",
		Issuer:       strings.TrimRight(strings.TrimSpace(cfg.Auth.Issuer), "/"),
		ClientID:     strings.TrimSpace(cfg.Auth.ClientID),
		AccessToken:  token.AccessToken,
		RefreshToken: token.RefreshToken,
		TokenType:    token.TokenType,
		Expiry:       token.Expiry,
		User:         user,
	}
}

func (r *authTokenRecord) oauthToken() *oauth2.Token {
	if r == nil {
		return &oauth2.Token{}
	}
	return &oauth2.Token{
		AccessToken:  r.AccessToken,
		RefreshToken: r.RefreshToken,
		TokenType:    r.TokenType,
		Expiry:       r.Expiry,
	}
}

func authRecordMatchesConfig(rec *authTokenRecord, cfg *config.Config) bool {
	if rec == nil || cfg == nil {
		return false
	}
	return rec.Provider == "oidc" &&
		rec.Issuer == strings.TrimRight(strings.TrimSpace(cfg.Auth.Issuer), "/") &&
		rec.ClientID == strings.TrimSpace(cfg.Auth.ClientID)
}

func authRecordPath() string {
	return filepath.Join(filepath.Dir(config.UserConfigPath()), authTokenFile)
}

func readAuthRecord() (*authTokenRecord, error) {
	b, err := os.ReadFile(authRecordPath())
	if err != nil {
		return nil, err
	}
	var rec authTokenRecord
	if err := json.Unmarshal(b, &rec); err != nil {
		return nil, err
	}
	return &rec, nil
}

func writeAuthRecord(rec *authTokenRecord) error {
	path := authRecordPath()
	if err := os.MkdirAll(filepath.Dir(path), authTokenDirPerm); err != nil {
		return err
	}
	b, err := json.MarshalIndent(rec, "", "  ")
	if err != nil {
		return err
	}
	b = append(b, '\n')
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, authTokenFilePerm)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := f.Chmod(authTokenFilePerm); err != nil {
		return err
	}
	if _, err := f.Write(b); err != nil {
		return err
	}
	return f.Close()
}

type oidcCallbackResult struct {
	code string
	err  error
}

func listenOIDCCallback(cfg *config.Config) (net.Listener, string, error) {
	minPort, maxPort := cfg.AuthCallbackPorts()
	if minPort <= 0 {
		minPort = defaultOIDCMinPort
	}
	if maxPort < minPort {
		maxPort = minPort
	}
	span := maxPort - minPort + 1
	offset := 0
	if span > 1 {
		if n, err := randomInt(span); err == nil {
			offset = n
		}
	}
	var lastErr error
	for i := 0; i < span; i++ {
		port := minPort + ((offset + i) % span)
		listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
		if err != nil {
			lastErr = err
			continue
		}
		redirectURL := fmt.Sprintf("http://127.0.0.1:%d%s", port, oidcCallbackPath)
		return listener, redirectURL, nil
	}
	return nil, "", fmt.Errorf("listen oidc callback on ports %d-%d: %w", minPort, maxPort, lastErr)
}

func serveOIDCCallback(ctx context.Context, listener net.Listener, state string) <-chan oidcCallbackResult {
	ch := make(chan oidcCallbackResult, 1)
	server := &http.Server{}
	mux := http.NewServeMux()
	server.Handler = mux
	send := func(result oidcCallbackResult) {
		select {
		case ch <- result:
		default:
		}
		go func() {
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			_ = server.Shutdown(shutdownCtx)
		}()
	}
	mux.HandleFunc(oidcCallbackPath, func(w http.ResponseWriter, r *http.Request) {
		if !isLoopbackRemote(r.RemoteAddr) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if got := r.URL.Query().Get("state"); got != state {
			http.Error(w, "invalid state", http.StatusBadRequest)
			send(oidcCallbackResult{err: fmt.Errorf("invalid oidc state")})
			return
		}
		if msg := r.URL.Query().Get("error"); msg != "" {
			desc := r.URL.Query().Get("error_description")
			http.Error(w, "authorization failed", http.StatusBadRequest)
			send(oidcCallbackResult{err: fmt.Errorf("oidc authorization failed: %s %s", msg, desc)})
			return
		}
		code := r.URL.Query().Get("code")
		if strings.TrimSpace(code) == "" {
			http.Error(w, "missing code", http.StatusBadRequest)
			send(oidcCallbackResult{err: fmt.Errorf("oidc callback missing code")})
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<!doctype html><title>VoltUI login complete</title><p>Login complete. You can return to VoltUI.</p>"))
		send(oidcCallbackResult{code: code})
	})
	go func() {
		if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			send(oidcCallbackResult{err: err})
		}
	}()
	go func() {
		<-ctx.Done()
		send(oidcCallbackResult{err: ctx.Err()})
	}()
	return ch
}

func isLoopbackRemote(remote string) bool {
	host, _, err := net.SplitHostPort(remote)
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (a *App) openAuthURL(authURL string) error {
	if _, err := url.ParseRequestURI(authURL); err != nil {
		return err
	}
	if a.ctx != nil {
		wailsruntime.BrowserOpenURL(a.ctx, authURL)
		return nil
	}
	switch goruntime.GOOS {
	case "darwin":
		return exec.Command("open", authURL).Start()
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", authURL).Start()
	default:
		return exec.Command("xdg-open", authURL).Start()
	}
}

func randomURLToken(size int) (string, error) {
	raw := make([]byte, size)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func randomInt(max int) (int, error) {
	if max <= 1 {
		return 0, nil
	}
	b := make([]byte, 1)
	if _, err := rand.Read(b); err != nil {
		return 0, err
	}
	return int(b[0]) % max, nil
}
