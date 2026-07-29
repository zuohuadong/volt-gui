package control

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"time"

	"voltui/internal/browserauth"
	"voltui/internal/event"
	"voltui/internal/tool"
)

var (
	errBrowserCredentialCancelled   = errors.New("browser credential request cancelled")
	errBrowserCredentialEmpty       = errors.New("browser credential password is required")
	errBrowserVerificationCancelled = errors.New("browser verification cancelled")
)

type browserCredentialReply struct {
	credential tool.BrowserCredential
	err        error
}

type pendingBrowserCredential struct {
	prompt event.BrowserPrompt
	reply  chan browserCredentialReply
}

type pendingBrowserVerification struct {
	prompt event.BrowserPrompt
	reply  chan bool
}

// browserPromptManager is deliberately separate from approvalManager: browser
// passwords only cross these private channels and can never enter Approval/Ask.
type browserPromptManager struct {
	mu            sync.Mutex
	promptMu      sync.Mutex
	nextID        int
	credentials   map[string]pendingBrowserCredential
	verifications map[string]pendingBrowserVerification
	vault         *browserauth.Vault
	timeout       time.Duration
}

func newBrowserPromptManager(vault *browserauth.Vault, timeout time.Duration) browserPromptManager {
	return browserPromptManager{
		credentials:   map[string]pendingBrowserCredential{},
		verifications: map[string]pendingBrowserVerification{},
		vault:         vault,
		timeout:       timeout,
	}
}

func (m *browserPromptManager) registerCredential(prompt event.BrowserPrompt) (event.BrowserPrompt, chan browserCredentialReply) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.nextID++
	prompt.ID = "browser-credential-" + strconv.Itoa(m.nextID)
	reply := make(chan browserCredentialReply, 1)
	m.credentials[prompt.ID] = pendingBrowserCredential{prompt: prompt, reply: reply}
	return prompt, reply
}

func (m *browserPromptManager) registerVerification(prompt event.BrowserPrompt) (event.BrowserPrompt, chan bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.nextID++
	prompt.ID = "browser-verification-" + strconv.Itoa(m.nextID)
	reply := make(chan bool, 1)
	m.verifications[prompt.ID] = pendingBrowserVerification{prompt: prompt, reply: reply}
	return prompt, reply
}

func (m *browserPromptManager) resolveCredential(id string, reply browserCredentialReply) {
	m.mu.Lock()
	pending, ok := m.credentials[id]
	delete(m.credentials, id)
	m.mu.Unlock()
	if ok {
		pending.reply <- reply
	}
}

func (m *browserPromptManager) resolveVerification(id string, continued bool) {
	m.mu.Lock()
	pending, ok := m.verifications[id]
	delete(m.verifications, id)
	m.mu.Unlock()
	if ok {
		pending.reply <- continued
	}
}

func (m *browserPromptManager) cancelCredential(id string) {
	m.mu.Lock()
	delete(m.credentials, id)
	m.mu.Unlock()
}

func (m *browserPromptManager) cancelVerification(id string) {
	m.mu.Lock()
	delete(m.verifications, id)
	m.mu.Unlock()
}

func (m *browserPromptManager) waitContext(ctx context.Context) (context.Context, context.CancelFunc) {
	if m.timeout <= 0 {
		return ctx, func() {}
	}
	return context.WithTimeout(ctx, m.timeout)
}

func (m *browserPromptManager) clearAll() {
	m.mu.Lock()
	credentials := m.credentials
	verifications := m.verifications
	m.credentials = map[string]pendingBrowserCredential{}
	m.verifications = map[string]pendingBrowserVerification{}
	m.mu.Unlock()
	for _, pending := range credentials {
		pending.reply <- browserCredentialReply{err: errBrowserCredentialCancelled}
	}
	for _, pending := range verifications {
		pending.reply <- false
	}
}

func (m *browserPromptManager) hasPending() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.credentials) > 0 || len(m.verifications) > 0
}

func (m *browserPromptManager) snapshot() ([]event.BrowserPrompt, []event.BrowserPrompt) {
	m.mu.Lock()
	defer m.mu.Unlock()
	credentials := make([]event.BrowserPrompt, 0, len(m.credentials))
	for _, pending := range m.credentials {
		credentials = append(credentials, pending.prompt)
	}
	verifications := make([]event.BrowserPrompt, 0, len(m.verifications))
	for _, pending := range m.verifications {
		verifications = append(verifications, pending.prompt)
	}
	return credentials, verifications
}

func (c *Controller) RequestBrowserCredential(ctx context.Context, req tool.BrowserCredentialRequest) (tool.BrowserCredential, error) {
	if c == nil {
		return tool.BrowserCredential{}, errBrowserCredentialCancelled
	}
	if c.browserPrompts.vault != nil {
		stored, ok, err := c.browserPrompts.vault.Load(req.Origin)
		if err == nil && ok && stored.Password != "" {
			return tool.BrowserCredential{Username: stored.Username, Password: stored.Password, Save: true}, nil
		}
		if err != nil {
			c.sink.Emit(event.Event{Kind: event.Notice, Level: event.LevelWarn, Text: "无法读取系统钥匙串中的浏览器凭据；将请求本次登录凭据。"})
		}
	}

	c.browserPrompts.promptMu.Lock()
	defer c.browserPrompts.promptMu.Unlock()
	prompt, reply := c.browserPrompts.registerCredential(event.BrowserPrompt{
		Origin: req.Origin,
		URL:    req.URL,
		Reason: req.Reason,
	})
	c.sink.Emit(event.Event{Kind: event.BrowserCredentialRequest, BrowserPrompt: prompt})
	waitCtx, cancel := c.browserPrompts.waitContext(ctx)
	defer cancel()
	select {
	case answer := <-reply:
		if answer.err != nil {
			return tool.BrowserCredential{}, answer.err
		}
		if answer.credential.Password == "" {
			return tool.BrowserCredential{}, errBrowserCredentialEmpty
		}
		if answer.credential.Save && c.browserPrompts.vault != nil {
			if err := c.browserPrompts.vault.Save(req.Origin, answer.credential.Username, answer.credential.Password); err != nil {
				c.sink.Emit(event.Event{Kind: event.Notice, Level: event.LevelWarn, Text: "浏览器凭据未保存到系统钥匙串；本次登录仍将继续。"})
			}
		}
		return answer.credential, nil
	case <-waitCtx.Done():
		c.browserPrompts.cancelCredential(prompt.ID)
		return tool.BrowserCredential{}, errBrowserCredentialCancelled
	}
}

func (c *Controller) SubmitBrowserCredential(id, username, password string, save bool) {
	if password == "" {
		c.browserPrompts.resolveCredential(id, browserCredentialReply{err: errBrowserCredentialEmpty})
		return
	}
	c.browserPrompts.resolveCredential(id, browserCredentialReply{credential: tool.BrowserCredential{
		Username: username,
		Password: password,
		Save:     save,
	}})
}

func (c *Controller) WaitBrowserVerification(ctx context.Context, req tool.BrowserVerificationRequest) (bool, error) {
	if c == nil {
		return false, errBrowserVerificationCancelled
	}
	c.browserPrompts.promptMu.Lock()
	defer c.browserPrompts.promptMu.Unlock()
	prompt, reply := c.browserPrompts.registerVerification(event.BrowserPrompt{
		Origin: req.Origin,
		URL:    req.URL,
		Reason: req.Reason,
	})
	c.sink.Emit(event.Event{Kind: event.BrowserVerificationRequest, BrowserPrompt: prompt})
	waitCtx, cancel := c.browserPrompts.waitContext(ctx)
	defer cancel()
	select {
	case continued := <-reply:
		if !continued {
			return false, errBrowserVerificationCancelled
		}
		return true, nil
	case <-waitCtx.Done():
		c.browserPrompts.cancelVerification(prompt.ID)
		return false, errBrowserVerificationCancelled
	}
}

func (c *Controller) CompleteBrowserVerification(id string, continued bool) {
	c.browserPrompts.resolveVerification(id, continued)
}
