// Command cnbrelease publishes an exact artifact set to CNB Releases.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type client struct {
	api           string
	repo          string
	token         string
	http          *http.Client
	tag           string
	releaseID     string
	releaseDraft  bool
	immutable     bool
	replacedDraft bool
	dryRun        bool
}

type uploadTicket struct {
	UploadURL string `json:"upload_url"`
	VerifyURL string `json:"verify_url"`
	Token     string `json:"token"`
	Path      string `json:"path"`
}

type releaseResponse struct {
	ID    string `json:"id"`
	Draft bool   `json:"draft"`
}

func main() {
	tag := flag.String("tag", "", "release tag, for example desktop-v1.2.3")
	version := flag.String("version", "", "release version, for example v1.2.3")
	dist := flag.String("dist", "../dist", "artifact directory")
	brand := flag.String("brand", envDefault("XIGU_BRAND_NAME", envDefault("VOLTUI_BRAND_NAME", "VoltUI")), "release display name")
	body := flag.String("body", "", "release body")
	prerelease := flag.Bool("prerelease", false, "mark release as prerelease")
	makeLatest := flag.String("make-latest", "legacy", "latest release policy: true, false, or legacy")
	assets := flag.String("assets", "", "comma-separated exact asset filenames; rejects missing or unexpected files")
	immutable := flag.Bool("immutable", false, "upload through a recoverable draft, reject published releases, and disable asset overwrite")
	dryRun := flag.Bool("dry-run", false, "validate files and print actions without network calls")
	flag.Parse()

	if *tag == "" || *version == "" {
		fail("tag and version are required")
	}
	if err := validateTagVersion(*tag, *version); err != nil {
		fail(err.Error())
	}
	if err := validateMakeLatest(*makeLatest); err != nil {
		fail(err.Error())
	}
	assetAllowlist, err := parseAssetAllowlist(*assets)
	if err != nil {
		fail(err.Error())
	}
	c := client{
		api:       strings.TrimRight(envDefault("CNB_API_ENDPOINT", "https://api.cnb.cool"), "/"),
		repo:      strings.Trim(strings.TrimPrefix(os.Getenv("CNB_REPO_SLUG"), "/"), "/"),
		token:     os.Getenv("CNB_TOKEN"),
		http:      &http.Client{Timeout: 5 * time.Minute},
		tag:       *tag,
		immutable: *immutable,
		dryRun:    *dryRun,
	}
	if c.repo == "" && !c.dryRun {
		fail("CNB_REPO_SLUG is required")
	}
	if c.token == "" && !c.dryRun {
		fail("CNB_TOKEN is required")
	}

	files, err := releaseFiles(*dist, assetAllowlist)
	if err != nil {
		fail(err.Error())
	}
	if len(files) == 0 {
		fail("no release files found in %s", *dist)
	}

	if c.dryRun {
		fmt.Printf("dry-run: would create CNB release %s (make_latest=%s, immutable=%t) and upload %d files\n", *tag, *makeLatest, *immutable, len(files))
		for _, f := range files {
			fmt.Println("dry-run:", filepath.Base(f))
		}
		return
	}

	if err := c.createRelease(*brand, *body, *prerelease, *makeLatest); err != nil {
		fail(err.Error())
	}
	if c.releaseID == "" {
		fail("CNB release %s has no id", c.tag)
	}

	for _, f := range files {
		if err := c.uploadFile(f); err != nil {
			if cleanupErr := c.cleanupImmutableDraft(); cleanupErr != nil {
				fail("%v; cleanup incomplete draft release: %v", err, cleanupErr)
			}
			fail(err.Error())
		}
	}
	if c.immutable {
		if err := c.finalizeRelease(*prerelease, *makeLatest); err != nil {
			// A transport error can be ambiguous: the PATCH may have succeeded even
			// if the response was lost. Keep the release for the next run to inspect
			// rather than risk deleting a newly published immutable release.
			fail("finalize immutable CNB release: %v", err)
		}
	}
}

func envDefault(k, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return fallback
}

func validateMakeLatest(value string) error {
	switch value {
	case "true", "false", "legacy":
		return nil
	default:
		return fmt.Errorf("make-latest must be true, false, or legacy, got %q", value)
	}
}

func validateTagVersion(tag, version string) error {
	if !strings.HasSuffix(tag, version) {
		return fmt.Errorf("tag %q must end with version %q", tag, version)
	}
	return nil
}

func parseAssetAllowlist(raw string) ([]string, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	seen := make(map[string]struct{})
	var names []string
	for _, part := range strings.Split(raw, ",") {
		name := strings.TrimSpace(part)
		if name == "" {
			return nil, errors.New("asset allowlist contains an empty filename")
		}
		if filepath.Base(name) != name || name == "." || name == ".." {
			return nil, fmt.Errorf("asset allowlist entry must be a filename, got %q", name)
		}
		if _, ok := seen[name]; ok {
			return nil, fmt.Errorf("asset allowlist contains duplicate filename %q", name)
		}
		seen[name] = struct{}{}
		names = append(names, name)
	}
	sort.Strings(names)
	return names, nil
}

func releaseFiles(dir string, allowlist []string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	available := make(map[string]string)
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		available[e.Name()] = filepath.Join(dir, e.Name())
	}
	if len(allowlist) == 0 {
		files := make([]string, 0, len(available))
		for _, path := range available {
			files = append(files, path)
		}
		sort.Strings(files)
		return files, nil
	}
	if len(available) != len(allowlist) {
		return nil, fmt.Errorf("release directory contains %d files, exact asset allowlist contains %d", len(available), len(allowlist))
	}
	files := make([]string, 0, len(allowlist))
	for _, name := range allowlist {
		path, ok := available[name]
		if !ok {
			return nil, fmt.Errorf("release directory is missing allowlisted asset %q", name)
		}
		files = append(files, path)
	}
	sort.Strings(files)
	return files, nil
}

func (c *client) createRelease(brand, body string, prerelease bool, makeLatest string) error {
	draft := c.immutable
	initialMakeLatest := makeLatest
	if draft {
		initialMakeLatest = "false"
	}
	payload := map[string]any{
		"tag_name":    c.tag,
		"name":        fmt.Sprintf("%s %s", brand, c.tag),
		"body":        body,
		"draft":       draft,
		"prerelease":  prerelease,
		"make_latest": initialMakeLatest,
	}
	reqBody, _ := json.Marshal(payload)
	req, err := c.newRequest(http.MethodPost, c.endpoint("/-/releases"), bytes.NewReader(reqBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resBody, status, err := c.do(req)
	if err != nil {
		return err
	}
	if status == http.StatusConflict {
		if c.immutable {
			if c.replacedDraft {
				return fmt.Errorf("CNB release %s still exists after removing its incomplete draft", c.tag)
			}
			if err := c.loadReleaseByTag(); err != nil {
				return err
			}
			if !c.releaseDraft {
				return fmt.Errorf("CNB release %s already exists and is published; immutable releases require a new tag", c.tag)
			}
			fmt.Printf("CNB release %s is an incomplete draft, removing it before retry\n", c.tag)
			if err := c.deleteRelease(); err != nil {
				return err
			}
			c.replacedDraft = true
			return c.createRelease(brand, body, prerelease, makeLatest)
		}
		fmt.Printf("CNB release %s already exists, continuing asset upload\n", c.tag)
		return c.loadReleaseByTag()
	}
	if status < 200 || status >= 300 {
		return fmt.Errorf("create CNB release: HTTP %d: %s", status, string(resBody))
	}
	var release releaseResponse
	if err := json.Unmarshal(resBody, &release); err != nil {
		return fmt.Errorf("decode created CNB release: %w", err)
	}
	c.releaseID = release.ID
	c.releaseDraft = draft
	fmt.Printf("created CNB release %s (%s)\n", c.tag, c.releaseID)
	return nil
}

func (c *client) loadReleaseByTag() error {
	req, err := c.newRequest(http.MethodGet, c.endpoint("/-/releases/tags/"+url.PathEscape(c.tag)), nil)
	if err != nil {
		return err
	}
	resBody, status, err := c.do(req)
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return fmt.Errorf("load CNB release by tag %s: HTTP %d: %s", c.tag, status, string(resBody))
	}
	var release releaseResponse
	if err := json.Unmarshal(resBody, &release); err != nil {
		return fmt.Errorf("decode CNB release by tag %s: %w", c.tag, err)
	}
	c.releaseID = release.ID
	c.releaseDraft = release.Draft
	fmt.Printf("loaded CNB release %s (%s)\n", c.tag, c.releaseID)
	return nil
}

func (c *client) finalizeRelease(prerelease bool, makeLatest string) error {
	payload := map[string]any{
		"draft":       false,
		"prerelease":  prerelease,
		"make_latest": makeLatest,
	}
	body, _ := json.Marshal(payload)
	req, err := c.newRequest(http.MethodPatch, c.endpoint("/-/releases/"+url.PathEscape(c.releaseID)), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	raw, status, err := c.do(req)
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return fmt.Errorf("publish CNB release %s: HTTP %d: %s", c.tag, status, string(raw))
	}
	c.releaseDraft = false
	fmt.Printf("published immutable CNB release %s\n", c.tag)
	return nil
}

func (c *client) cleanupImmutableDraft() error {
	if !c.immutable || !c.releaseDraft || c.releaseID == "" {
		return nil
	}
	return c.deleteRelease()
}

func (c *client) deleteRelease() error {
	req, err := c.newRequest(http.MethodDelete, c.endpoint("/-/releases/"+url.PathEscape(c.releaseID)), nil)
	if err != nil {
		return err
	}
	raw, status, err := c.do(req)
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return fmt.Errorf("delete draft CNB release %s: HTTP %d: %s", c.tag, status, string(raw))
	}
	c.releaseID = ""
	c.releaseDraft = false
	return nil
}

func (c client) uploadFile(file string) error {
	name := filepath.Base(file)
	ticket, err := c.requestUploadTicket(file)
	if err != nil {
		return err
	}
	if ticket.UploadURL == "" {
		return fmt.Errorf("upload ticket for %s has no upload_url", name)
	}
	if err := putFile(c.http, ticket.UploadURL, file); err != nil {
		return err
	}
	verifyURL := ticket.VerifyURL
	if verifyURL == "" {
		verifyURL = c.confirmationURL(ticket, name)
	}
	if verifyURL == "" {
		return fmt.Errorf("upload ticket for %s has no verify_url or token/path", name)
	}
	if err := c.confirmUpload(verifyURL); err != nil {
		return err
	}
	fmt.Printf("uploaded CNB release asset %s\n", name)
	return nil
}

func (c client) requestUploadTicket(file string) (uploadTicket, error) {
	name := filepath.Base(file)
	info, err := os.Stat(file)
	if err != nil {
		return uploadTicket{}, err
	}
	payload := map[string]any{
		"asset_name": name,
		"overwrite":  !c.immutable,
		"size":       info.Size(),
		"ttl":        0,
	}
	body, _ := json.Marshal(payload)

	endpoints := []string{
		c.endpoint("/-/releases/" + url.PathEscape(c.releaseID) + "/asset-upload-url"),
	}
	var lastErr error
	for _, endpoint := range endpoints {
		req, err := c.newRequest(http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return uploadTicket{}, err
		}
		req.Header.Set("Content-Type", "application/json")
		raw, status, err := c.do(req)
		if err != nil {
			lastErr = err
			continue
		}
		if status < 200 || status >= 300 {
			lastErr = fmt.Errorf("request upload url %s: HTTP %d: %s", endpoint, status, string(raw))
			continue
		}
		var ticket uploadTicket
		if err := json.Unmarshal(raw, &ticket); err != nil {
			return uploadTicket{}, fmt.Errorf("decode upload ticket for %s: %w", name, err)
		}
		if ticket.UploadURL != "" {
			return ticket, nil
		}
		lastErr = fmt.Errorf("upload ticket response from %s has no upload_url", endpoint)
	}
	if lastErr == nil {
		lastErr = errors.New("no CNB upload endpoint attempted")
	}
	return uploadTicket{}, lastErr
}

func (c client) confirmationURL(ticket uploadTicket, name string) string {
	token := ticket.Token
	assetPath := ticket.Path
	if assetPath == "" {
		assetPath = name
	}
	if token == "" {
		return ""
	}
	return c.endpoint("/-/releases/" + url.PathEscape(c.releaseID) + "/asset-upload-confirmation/" + url.PathEscape(token) + "/" + url.PathEscape(assetPath) + "?ttl=0")
}

func putFile(hc *http.Client, uploadURL, file string) error {
	f, err := os.Open(file)
	if err != nil {
		return err
	}
	defer f.Close()
	req, err := http.NewRequest(http.MethodPut, uploadURL, f)
	if err != nil {
		return err
	}
	if mt := mime.TypeByExtension(filepath.Ext(file)); mt != "" {
		req.Header.Set("Content-Type", mt)
	}
	resp, err := hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("upload %s: HTTP %d: %s", filepath.Base(file), resp.StatusCode, string(raw))
	}
	return nil
}

func (c client) confirmUpload(verifyURL string) error {
	req, err := c.newRequest(http.MethodPost, c.absoluteURL(verifyURL), nil)
	if err != nil {
		return err
	}
	raw, status, err := c.do(req)
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return fmt.Errorf("confirm upload: HTTP %d: %s", status, string(raw))
	}
	return nil
}

func (c client) newRequest(method, u string, body io.Reader) (*http.Request, error) {
	req, err := http.NewRequest(method, u, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.cnb.api+json")
	req.Header.Set("Authorization", "Bearer "+c.token)
	return req, nil
}

func (c client) do(req *http.Request) ([]byte, int, error) {
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return raw, resp.StatusCode, nil
}

func (c client) endpoint(suffix string) string {
	return c.api + "/" + c.repo + suffix
}

func (c client) absoluteURL(raw string) string {
	if strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
		return raw
	}
	if strings.HasPrefix(raw, "/") {
		return c.api + raw
	}
	return c.api + "/" + raw
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "cnbrelease: "+format+"\n", args...)
	os.Exit(1)
}
