package main

import (
	"time"

	"voltui/internal/browserauth"
)

type BrowserCredentialView struct {
	Origin    string `json:"origin"`
	Username  string `json:"username"`
	UpdatedAt string `json:"updatedAt"`
}

var newBrowserCredentialVault = func() *browserauth.Vault {
	return browserauth.NewVault()
}

func (a *App) SubmitBrowserCredentialTab(tabID, id, username, password string, save bool) {
	ctrl := a.ctrlByTabID(tabID)
	if prompt, ok := ctrl.(interface {
		SubmitBrowserCredential(string, string, string, bool)
	}); ok {
		prompt.SubmitBrowserCredential(id, username, password, save)
	}
}

func (a *App) CompleteBrowserVerificationTab(tabID, id string, continued bool) {
	ctrl := a.ctrlByTabID(tabID)
	if prompt, ok := ctrl.(interface {
		CompleteBrowserVerification(string, bool)
	}); ok {
		prompt.CompleteBrowserVerification(id, continued)
	}
}

func (a *App) ListBrowserCredentials() ([]BrowserCredentialView, error) {
	items, err := newBrowserCredentialVault().List()
	if err != nil {
		return nil, err
	}
	views := make([]BrowserCredentialView, 0, len(items))
	for _, item := range items {
		updatedAt := ""
		if !item.UpdatedAt.IsZero() {
			updatedAt = item.UpdatedAt.UTC().Format(time.RFC3339)
		}
		views = append(views, BrowserCredentialView{Origin: item.Origin, Username: item.Username, UpdatedAt: updatedAt})
	}
	return views, nil
}

func (a *App) RemoveBrowserCredential(origin string) error {
	return newBrowserCredentialVault().Delete(origin)
}
