package browserauth

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/zalando/go-keyring"
)

type fakeBackend struct {
	value       string
	getErr      error
	setErr      error
	deleteErr   error
	setCalls    int
	deleteCalls int
}

func (f *fakeBackend) Get(_, _ string) (string, error) {
	if f.getErr != nil {
		return "", f.getErr
	}
	if f.value == "" {
		return "", keyring.ErrNotFound
	}
	return f.value, nil
}

func (f *fakeBackend) Set(_, _, value string) error {
	if f.setErr != nil {
		return f.setErr
	}
	f.setCalls++
	f.value = value
	return nil
}

func (f *fakeBackend) Delete(_, _ string) error {
	if f.deleteErr != nil {
		return f.deleteErr
	}
	f.deleteCalls++
	f.value = ""
	return nil
}

func TestVaultStoresOneVersionedMapAndNeverListsPasswords(t *testing.T) {
	backend := &fakeBackend{}
	now := time.Date(2026, 7, 13, 9, 30, 0, 0, time.UTC)
	vault := NewVault(WithBackend(backend), WithClock(func() time.Time { return now }))

	if err := vault.Save("HTTPS://Example.COM/login", "alice", "s3cr3t"); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if backend.setCalls != 1 || !strings.Contains(backend.value, `"version":1`) || !strings.Contains(backend.value, `"https://example.com:443"`) {
		t.Fatalf("keyring payload = %q, setCalls=%d", backend.value, backend.setCalls)
	}

	got, ok, err := vault.Load("https://example.com/other")
	if err != nil || !ok || got.Username != "alice" || got.Password != "s3cr3t" {
		t.Fatalf("Load = %#v, %v, %v", got, ok, err)
	}
	items, err := vault.List()
	if err != nil || len(items) != 1 {
		t.Fatalf("List = %#v, %v", items, err)
	}
	if items[0].Origin != "https://example.com:443" || items[0].Username != "alice" || !items[0].UpdatedAt.Equal(now) {
		t.Fatalf("metadata = %#v", items[0])
	}
	if strings.Contains(strings.ToLower(items[0].String()), "s3cr3t") {
		t.Fatalf("metadata leaked password: %s", items[0].String())
	}

	if err := vault.Delete("https://example.com"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if backend.deleteCalls != 1 {
		t.Fatalf("Delete calls = %d, want 1", backend.deleteCalls)
	}
	if _, ok, err := vault.Load("https://example.com"); err != nil || ok {
		t.Fatalf("Load after delete ok=%v err=%v", ok, err)
	}
}

func TestVaultRejectsEmptyPasswordsAndDoesNotEchoThemInErrors(t *testing.T) {
	backend := &fakeBackend{setErr: errors.New("keyring unavailable")}
	vault := NewVault(WithBackend(backend))
	if err := vault.Save("https://example.com", "alice", ""); err == nil {
		t.Fatal("empty password should fail")
	}
	const secret = "top-secret-value"
	err := vault.Save("https://example.com", "alice", secret)
	if err == nil || strings.Contains(err.Error(), secret) {
		t.Fatalf("Save error = %v", err)
	}
}
