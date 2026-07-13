package control

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/zalando/go-keyring"

	"voltui/internal/browserauth"
	"voltui/internal/event"
	"voltui/internal/tool"
)

type promptKeyringBackend struct {
	mu       sync.Mutex
	value    string
	setErr   error
	setCalls int
}

func (b *promptKeyringBackend) Get(_, _ string) (string, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.value == "" {
		return "", keyring.ErrNotFound
	}
	return b.value, nil
}

func (b *promptKeyringBackend) Set(_, _, value string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.setErr != nil {
		return b.setErr
	}
	b.setCalls++
	b.value = value
	return nil
}

func (b *promptKeyringBackend) Delete(_, _ string) error {
	b.mu.Lock()
	b.value = ""
	b.mu.Unlock()
	return nil
}

func newBrowserPromptController(backend *promptKeyringBackend) (*Controller, <-chan event.Event) {
	events := make(chan event.Event, 16)
	c := New(Options{
		Sink:                   event.FuncSink(func(e event.Event) { events <- e }),
		BrowserCredentialVault: browserauth.NewVault(browserauth.WithBackend(backend)),
	})
	return c, events
}

func waitBrowserPromptEvent(t *testing.T, events <-chan event.Event, kind event.Kind) event.Event {
	t.Helper()
	select {
	case e := <-events:
		if e.Kind != kind {
			t.Fatalf("event kind = %v, want %v: %#v", e.Kind, kind, e)
		}
		return e
	case <-time.After(time.Second):
		t.Fatalf("timed out waiting for browser prompt kind %v", kind)
		return event.Event{}
	}
}

func TestBrowserCredentialPromptIsMetadataOnlyAndSaveFalseDoesNotWrite(t *testing.T) {
	backend := &promptKeyringBackend{}
	c, events := newBrowserPromptController(backend)
	result := make(chan tool.BrowserCredential, 1)
	errCh := make(chan error, 1)
	go func() {
		credential, err := c.RequestBrowserCredential(context.Background(), tool.BrowserCredentialRequest{
			Origin: "https://example.com:443", URL: "https://example.com/login", Reason: "login requested",
		})
		result <- credential
		errCh <- err
	}()

	e := waitBrowserPromptEvent(t, events, event.BrowserCredentialRequest)
	if e.BrowserPrompt.Origin != "https://example.com:443" || e.BrowserPrompt.URL != "https://example.com/login" || e.BrowserPrompt.HasSaved {
		t.Fatalf("browser prompt metadata = %#v", e.BrowserPrompt)
	}
	c.SubmitBrowserCredential(e.BrowserPrompt.ID, "alice", "prompt-secret", false)
	if err := <-errCh; err != nil {
		t.Fatalf("RequestBrowserCredential: %v", err)
	}
	credential := <-result
	if credential.Username != "alice" || credential.Password != "prompt-secret" || credential.Save {
		t.Fatalf("credential = %#v", credential)
	}
	backend.mu.Lock()
	setCalls := backend.setCalls
	backend.mu.Unlock()
	if setCalls != 0 {
		t.Fatalf("save=false wrote keyring %d time(s)", setCalls)
	}
	raw, err := json.Marshal(e)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "prompt-secret") {
		t.Fatalf("event leaked password: %s", raw)
	}
}

func TestBrowserCredentialSaveAndSavedAutomaticReuse(t *testing.T) {
	backend := &promptKeyringBackend{}
	c, events := newBrowserPromptController(backend)
	result := make(chan tool.BrowserCredential, 1)
	go func() {
		credential, _ := c.RequestBrowserCredential(context.Background(), tool.BrowserCredentialRequest{Origin: "https://example.com", URL: "https://example.com/login"})
		result <- credential
	}()
	e := waitBrowserPromptEvent(t, events, event.BrowserCredentialRequest)
	c.SubmitBrowserCredential(e.BrowserPrompt.ID, "alice", "saved-secret", true)
	if credential := <-result; credential.Password != "saved-secret" || !credential.Save {
		t.Fatalf("first credential = %#v", credential)
	}

	credential, err := c.RequestBrowserCredential(context.Background(), tool.BrowserCredentialRequest{Origin: "https://example.com:443", URL: "https://example.com/again"})
	if err != nil || credential.Username != "alice" || credential.Password != "saved-secret" || !credential.Save {
		t.Fatalf("saved reuse = %#v, %v", credential, err)
	}
	select {
	case unexpected := <-events:
		t.Fatalf("saved credential unexpectedly prompted: %#v", unexpected)
	case <-time.After(30 * time.Millisecond):
	}
}

func TestBrowserCredentialSaveFailureWarnsWithoutSecretAndStillContinues(t *testing.T) {
	backend := &promptKeyringBackend{setErr: errors.New("keyring unavailable")}
	c, events := newBrowserPromptController(backend)
	result := make(chan tool.BrowserCredential, 1)
	go func() {
		credential, _ := c.RequestBrowserCredential(context.Background(), tool.BrowserCredentialRequest{Origin: "https://example.com", URL: "https://example.com/login"})
		result <- credential
	}()
	e := waitBrowserPromptEvent(t, events, event.BrowserCredentialRequest)
	c.SubmitBrowserCredential(e.BrowserPrompt.ID, "alice", "warning-secret", true)
	if credential := <-result; credential.Password != "warning-secret" {
		t.Fatalf("credential was not returned after save failure: %#v", credential)
	}
	warn := waitBrowserPromptEvent(t, events, event.Notice)
	if warn.Level != event.LevelWarn || strings.Contains(warn.Text+warn.Detail, "warning-secret") {
		t.Fatalf("unsafe warning = %#v", warn)
	}
}

func TestBrowserCredentialEmptyPasswordAndCancelFailClosed(t *testing.T) {
	backend := &promptKeyringBackend{}
	c, events := newBrowserPromptController(backend)
	ctx, cancel := context.WithCancel(context.Background())
	c.mu.Lock()
	c.cancel = cancel
	c.mu.Unlock()
	errCh := make(chan error, 1)
	go func() {
		_, err := c.RequestBrowserCredential(ctx, tool.BrowserCredentialRequest{Origin: "https://example.com", URL: "https://example.com/login"})
		errCh <- err
	}()
	e := waitBrowserPromptEvent(t, events, event.BrowserCredentialRequest)
	c.SubmitBrowserCredential(e.BrowserPrompt.ID, "alice", "", false)
	if err := <-errCh; err == nil {
		t.Fatal("empty password should fail closed")
	}

	ctx, cancel = context.WithCancel(context.Background())
	c.mu.Lock()
	c.cancel = cancel
	c.mu.Unlock()
	go func() {
		_, err := c.RequestBrowserCredential(ctx, tool.BrowserCredentialRequest{Origin: "https://other.example", URL: "https://other.example/login"})
		errCh <- err
	}()
	_ = waitBrowserPromptEvent(t, events, event.BrowserCredentialRequest)
	if !c.PendingPrompt() {
		t.Fatal("PendingPrompt should include browser credential prompt")
	}
	c.Cancel()
	if err := <-errCh; err == nil {
		t.Fatal("cancelled credential prompt should fail closed")
	}
	if c.PendingPrompt() {
		t.Fatal("browser prompt remained pending after Cancel")
	}
}

func TestBrowserCredentialPromptCloseFailsClosed(t *testing.T) {
	c, events := newBrowserPromptController(&promptKeyringBackend{})
	errCh := make(chan error, 1)
	go func() {
		_, err := c.RequestBrowserCredential(context.Background(), tool.BrowserCredentialRequest{
			Origin: "https://example.com", URL: "https://example.com/login",
		})
		errCh <- err
	}()
	_ = waitBrowserPromptEvent(t, events, event.BrowserCredentialRequest)

	c.Close()

	if err := <-errCh; err == nil {
		t.Fatal("closed credential prompt should fail closed")
	}
	if c.PendingPrompt() {
		t.Fatal("browser prompt remained pending after Close")
	}
}

func TestBrowserVerificationPromptReplayAndCompletion(t *testing.T) {
	c, events := newBrowserPromptController(&promptKeyringBackend{})
	result := make(chan bool, 1)
	go func() {
		continued, _ := c.WaitBrowserVerification(context.Background(), tool.BrowserVerificationRequest{
			Origin: "https://example.com:443", URL: "https://example.com/mfa", Reason: "verification code detected",
		})
		result <- continued
	}()
	e := waitBrowserPromptEvent(t, events, event.BrowserVerificationRequest)
	c.ReplayPendingPrompts()
	replayed := waitBrowserPromptEvent(t, events, event.BrowserVerificationRequest)
	if replayed.BrowserPrompt.ID != e.BrowserPrompt.ID || replayed.BrowserPrompt.Reason != "verification code detected" {
		t.Fatalf("replayed prompt = %#v, want %#v", replayed.BrowserPrompt, e.BrowserPrompt)
	}
	c.CompleteBrowserVerification(e.BrowserPrompt.ID, true)
	if continued := <-result; !continued {
		t.Fatal("verification completion should continue")
	}
}
