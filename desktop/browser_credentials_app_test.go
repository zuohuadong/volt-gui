package main

import (
	"sync"
	"testing"

	"github.com/zalando/go-keyring"

	"voltui/internal/browserauth"
)

type desktopBrowserCredentialBackend struct {
	mu    sync.Mutex
	value string
}

func (b *desktopBrowserCredentialBackend) Get(_, _ string) (string, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.value == "" {
		return "", keyring.ErrNotFound
	}
	return b.value, nil
}

func (b *desktopBrowserCredentialBackend) Set(_, _, value string) error {
	b.mu.Lock()
	b.value = value
	b.mu.Unlock()
	return nil
}

func (b *desktopBrowserCredentialBackend) Delete(_, _ string) error {
	b.mu.Lock()
	b.value = ""
	b.mu.Unlock()
	return nil
}

func TestBrowserCredentialSettingsListAndDeleteMetadataOnly(t *testing.T) {
	backend := &desktopBrowserCredentialBackend{}
	vault := browserauth.NewVault(browserauth.WithBackend(backend))
	if err := vault.Save("https://example.com/login", "alice", "desktop-secret"); err != nil {
		t.Fatal(err)
	}
	old := newBrowserCredentialVault
	newBrowserCredentialVault = func() *browserauth.Vault { return vault }
	t.Cleanup(func() { newBrowserCredentialVault = old })

	app := NewApp()
	items, err := app.ListBrowserCredentials()
	if err != nil || len(items) != 1 {
		t.Fatalf("ListBrowserCredentials = %#v, %v", items, err)
	}
	if items[0].Origin != "https://example.com:443" || items[0].Username != "alice" {
		t.Fatalf("credential metadata = %#v", items[0])
	}
	if err := app.RemoveBrowserCredential(items[0].Origin); err != nil {
		t.Fatal(err)
	}
	items, err = app.ListBrowserCredentials()
	if err != nil || len(items) != 0 {
		t.Fatalf("credentials after delete = %#v, %v", items, err)
	}
}
