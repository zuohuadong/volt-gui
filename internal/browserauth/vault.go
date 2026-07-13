package browserauth

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/zalando/go-keyring"
)

const (
	keyringService = "voltui.browser-auth"
	keyringAccount = "credentials-v1"
	storeVersion   = 1
)

// Backend is the minimal OS-keyring boundary used by Vault. Tests inject an
// in-memory implementation so they never access the developer's real keyring.
type Backend interface {
	Get(service, user string) (string, error)
	Set(service, user, password string) error
	Delete(service, user string) error
}

type osKeyringBackend struct{}

func (osKeyringBackend) Get(service, user string) (string, error) {
	return keyring.Get(service, user)
}

func (osKeyringBackend) Set(service, user, password string) error {
	return keyring.Set(service, user, password)
}

func (osKeyringBackend) Delete(service, user string) error {
	return keyring.Delete(service, user)
}

// Credential is returned only to the in-process browser interaction provider.
// It must never be serialized, logged, or copied into tool results.
type Credential struct {
	Username  string    `json:"-"`
	Password  string    `json:"-"`
	UpdatedAt time.Time `json:"-"`
}

// Metadata is the password-free view used by settings and prompt hints.
type Metadata struct {
	Origin    string    `json:"origin"`
	Username  string    `json:"username"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (m Metadata) String() string {
	return fmt.Sprintf("%s %s %s", m.Origin, m.Username, m.UpdatedAt.UTC().Format(time.RFC3339))
}

type storedCredential struct {
	Username  string    `json:"username"`
	Password  string    `json:"password"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type credentialStore struct {
	Version     int                         `json:"version"`
	Credentials map[string]storedCredential `json:"credentials"`
}

type Option func(*Vault)

func WithBackend(backend Backend) Option {
	return func(v *Vault) {
		if backend != nil {
			v.backend = backend
		}
	}
}

func WithClock(clock func() time.Time) Option {
	return func(v *Vault) {
		if clock != nil {
			v.now = clock
		}
	}
}

// Vault stores the complete versioned origin->credential map in one OS
// keyring item. No credential bytes are written to config files or env vars.
type Vault struct {
	mu      sync.Mutex
	backend Backend
	now     func() time.Time
}

func NewVault(opts ...Option) *Vault {
	v := &Vault{backend: osKeyringBackend{}, now: time.Now}
	for _, opt := range opts {
		if opt != nil {
			opt(v)
		}
	}
	return v
}

// NormalizeOrigin canonicalizes an HTTP(S) URL to scheme + host + effective
// port. Paths, queries, fragments, userinfo, and trailing DNS dots are omitted.
func NormalizeOrigin(raw string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u == nil {
		return "", fmt.Errorf("invalid browser origin")
	}
	scheme := strings.ToLower(strings.TrimSpace(u.Scheme))
	if scheme != "http" && scheme != "https" {
		return "", fmt.Errorf("browser origin must use http or https")
	}
	host := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(u.Hostname()), "."))
	if host == "" {
		return "", fmt.Errorf("browser origin host is required")
	}
	port := u.Port()
	if port == "" {
		if scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}
	n, err := strconv.Atoi(port)
	if err != nil || n < 1 || n > 65535 {
		return "", fmt.Errorf("browser origin port is invalid")
	}
	return scheme + "://" + net.JoinHostPort(host, strconv.Itoa(n)), nil
}

func (v *Vault) Load(rawOrigin string) (Credential, bool, error) {
	origin, err := NormalizeOrigin(rawOrigin)
	if err != nil {
		return Credential{}, false, err
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	store, found, err := v.loadLocked()
	if err != nil || !found {
		return Credential{}, false, err
	}
	stored, ok := store.Credentials[origin]
	if !ok {
		return Credential{}, false, nil
	}
	return Credential{Username: stored.Username, Password: stored.Password, UpdatedAt: stored.UpdatedAt}, true, nil
}

func (v *Vault) Save(rawOrigin, username, password string) error {
	origin, err := NormalizeOrigin(rawOrigin)
	if err != nil {
		return err
	}
	if password == "" {
		return fmt.Errorf("browser credential password is required")
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	store, _, err := v.loadLocked()
	if err != nil {
		return fmt.Errorf("load browser credential vault: %w", err)
	}
	store.Credentials[origin] = storedCredential{
		Username:  username,
		Password:  password,
		UpdatedAt: v.now().UTC(),
	}
	return v.saveLocked(store)
}

func (v *Vault) Delete(rawOrigin string) error {
	origin, err := NormalizeOrigin(rawOrigin)
	if err != nil {
		return err
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	store, found, err := v.loadLocked()
	if err != nil || !found {
		return err
	}
	if _, ok := store.Credentials[origin]; !ok {
		return nil
	}
	delete(store.Credentials, origin)
	if len(store.Credentials) == 0 {
		if err := v.backend.Delete(keyringService, keyringAccount); err != nil && !errors.Is(err, keyring.ErrNotFound) {
			return fmt.Errorf("delete browser credential vault: %w", err)
		}
		return nil
	}
	return v.saveLocked(store)
}

func (v *Vault) List() ([]Metadata, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	store, found, err := v.loadLocked()
	if err != nil || !found {
		return nil, err
	}
	items := make([]Metadata, 0, len(store.Credentials))
	for origin, credential := range store.Credentials {
		items = append(items, Metadata{Origin: origin, Username: credential.Username, UpdatedAt: credential.UpdatedAt})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Origin < items[j].Origin })
	return items, nil
}

func (v *Vault) loadLocked() (credentialStore, bool, error) {
	store := credentialStore{Version: storeVersion, Credentials: map[string]storedCredential{}}
	raw, err := v.backend.Get(keyringService, keyringAccount)
	if errors.Is(err, keyring.ErrNotFound) {
		return store, false, nil
	}
	if err != nil {
		return credentialStore{}, false, fmt.Errorf("read OS keyring: %w", err)
	}
	if err := json.Unmarshal([]byte(raw), &store); err != nil {
		return credentialStore{}, false, fmt.Errorf("decode browser credential vault")
	}
	if store.Version != storeVersion {
		return credentialStore{}, false, fmt.Errorf("unsupported browser credential vault version")
	}
	if store.Credentials == nil {
		store.Credentials = map[string]storedCredential{}
	}
	return store, true, nil
}

func (v *Vault) saveLocked(store credentialStore) error {
	store.Version = storeVersion
	raw, err := json.Marshal(store)
	if err != nil {
		return fmt.Errorf("encode browser credential vault")
	}
	if err := v.backend.Set(keyringService, keyringAccount, string(raw)); err != nil {
		return fmt.Errorf("write OS keyring: %w", err)
	}
	return nil
}
