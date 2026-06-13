// fetch.go — model auto-discovery via the OpenAI-compatible GET /models API.
package config

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"voltui/internal/provider/openai"
)

func BuildModelFetchURLs(baseURL, override string) ([]string, error) {
	if override = strings.TrimSpace(override); override != "" {
		return []string{override}, nil
	}
	u, err := url.Parse(strings.TrimRight(strings.TrimSpace(baseURL), "/"))
	if err != nil {
		return nil, err
	}
	if u.Scheme == "" || u.Host == "" {
		return nil, fmt.Errorf("fetch models: invalid base_url %q", baseURL)
	}

	seen := map[string]bool{}
	var out []string
	add := func(candidate string) {
		if candidate == "" || seen[candidate] {
			return
		}
		seen[candidate] = true
		out = append(out, candidate)
	}
	base := strings.TrimRight(u.String(), "/")
	add(base + "/models")
	if !strings.HasSuffix(strings.TrimRight(u.Path, "/"), "/v1") {
		add(base + "/v1/models")
	}
	if strings.Contains(strings.ToLower(u.Path), "anthropic") {
		root := *u
		root.Path = ""
		root.RawPath = ""
		root.RawQuery = ""
		root.Fragment = ""
		rootBase := strings.TrimRight(root.String(), "/")
		add(rootBase + "/models")
		add(rootBase + "/v1/models")
	}
	return out, nil
}

// FetchModels queries the provider's OpenAI-compatible GET /models endpoint and
// returns the available model IDs, sorted alphabetically.
func (e *ProviderEntry) FetchModels(ctx context.Context) ([]string, error) {
	if e.BaseURL == "" {
		return nil, fmt.Errorf("fetch models: provider %q has no base_url", e.Name)
	}
	key := e.APIKey()
	if key == "" {
		return nil, fmt.Errorf("fetch models: provider %q has no API key (set %s in .env)", e.Name, e.APIKeyEnv)
	}
	urls, err := BuildModelFetchURLs(e.BaseURL, e.ModelsURL)
	if err != nil {
		return nil, err
	}
	var lastErr error
	for _, endpoint := range urls {
		models, err := openai.FetchModels(ctx, endpoint, key)
		if err == nil {
			return models, nil
		}
		lastErr = err
	}
	return nil, lastErr
}
