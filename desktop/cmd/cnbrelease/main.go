// Command cnbrelease publishes desktop release artifacts to CNB Releases.
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
	api       string
	repo      string
	token     string
	http      *http.Client
	tag       string
	releaseID string
	dryRun    bool
}

type uploadTicket struct {
	UploadURL string `json:"upload_url"`
	VerifyURL string `json:"verify_url"`
	Token     string `json:"token"`
	Path      string `json:"path"`
}

type releaseResponse struct {
	ID string `json:"id"`
}

func main() {
	tag := flag.String("tag", "", "desktop release tag, for example desktop-v1.2.3")
	version := flag.String("version", "", "desktop version, for example v1.2.3")
	dist := flag.String("dist", "../dist", "artifact directory")
	brand := flag.String("brand", envDefault("XIGU_BRAND_NAME", envDefault("VOLTUI_BRAND_NAME", "VoltUI")), "release display name")
	body := flag.String("body", "", "release body")
	prerelease := flag.Bool("prerelease", false, "mark release as prerelease")
	dryRun := flag.Bool("dry-run", false, "validate files and print actions without network calls")
	flag.Parse()

	if *tag == "" || *version == "" {
		fail("tag and version are required")
	}
	c := client{
		api:    strings.TrimRight(envDefault("CNB_API_ENDPOINT", "https://api.cnb.cool"), "/"),
		repo:   strings.Trim(strings.TrimPrefix(os.Getenv("CNB_REPO_SLUG"), "/"), "/"),
		token:  os.Getenv("CNB_TOKEN"),
		http:   &http.Client{Timeout: 5 * time.Minute},
		tag:    *tag,
		dryRun: *dryRun,
	}
	if c.repo == "" && !c.dryRun {
		fail("CNB_REPO_SLUG is required")
	}
	if c.token == "" && !c.dryRun {
		fail("CNB_TOKEN is required")
	}

	files, err := releaseFiles(*dist)
	if err != nil {
		fail(err.Error())
	}
	if len(files) == 0 {
		fail("no release files found in %s", *dist)
	}

	if c.dryRun {
		fmt.Printf("dry-run: would create CNB release %s and upload %d files\n", *tag, len(files))
		for _, f := range files {
			fmt.Println("dry-run:", filepath.Base(f))
		}
		return
	}

	if err := c.createRelease(*brand, *body, *prerelease); err != nil {
		fail(err.Error())
	}
	if c.releaseID == "" {
		fail("CNB release %s has no id", c.tag)
	}

	for _, f := range files {
		if err := c.uploadFile(f); err != nil {
			fail(err.Error())
		}
	}
}

func envDefault(k, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return fallback
}

func releaseFiles(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var files []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		files = append(files, filepath.Join(dir, e.Name()))
	}
	sort.Strings(files)
	return files, nil
}

func (c *client) createRelease(brand, body string, prerelease bool) error {
	payload := map[string]any{
		"tag_name":   c.tag,
		"name":       fmt.Sprintf("%s %s", brand, c.tag),
		"body":       body,
		"draft":      false,
		"prerelease": prerelease,
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
	fmt.Printf("loaded CNB release %s (%s)\n", c.tag, c.releaseID)
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
		"overwrite":  true,
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
