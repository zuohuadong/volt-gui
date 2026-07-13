package builtin

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/proxy"

	"voltui/internal/netclient"
	"voltui/internal/tool"
)

func init() { tool.RegisterBuiltin(webFetch{}) }

type webFetch struct {
	proxySpec       netclient.ProxySpec
	trustedIntranet TrustedIntranetPolicy
	lookupIP        func(context.Context, string) ([]net.IPAddr, error)
	dialContext     func(context.Context, string, string) (net.Conn, error)
}

type TrustedIntranetPolicy struct {
	Enabled bool
	Sites   []TrustedIntranetSite
}

type TrustedIntranetSite struct {
	Host  string
	CIDRs []string
	Ports []int
}

const (
	webFetchTimeout = 15 * time.Second
	webFetchMaxRead = 1 << 20 // 1 MiB cap before extraction
)

func (webFetch) Name() string { return "web_fetch" }

func (webFetch) Description() string {
	return "Fetch a URL over HTTPS/HTTP and return its text content. HTML pages are reduced to readable text (scripts, styles, tags stripped, whitespace collapsed); JSON / plain text / markdown bodies come back verbatim. Use to read documentation pages, API responses, or source files hosted somewhere the local filesystem can't reach."
}

func (webFetch) Schema() json.RawMessage {
	return json.RawMessage(`{
"type":"object",
"properties":{
  "url":{"type":"string","description":"Absolute URL beginning with http:// or https://"}
},
"required":["url"]
}`)
}

func (webFetch) ReadOnly() bool { return true }

// ssrfGuardedTransport refuses to connect to private, link-local, or unspecified
// addresses — the SSRF surface a prompt-injected fetch would aim at (cloud
// metadata at 169.254.169.254, RFC1918 internal services). Loopback is allowed:
// the agent can already reach localhost via bash, so a local dev server stays
// fetchable. The check runs at dial time on the resolved IP, so a public host
// that redirects or DNS-rebinds to an internal address is caught too.
func ssrfGuardedTransport(proxyURL string) *http.Transport {
	dialer := &net.Dialer{Timeout: webFetchTimeout}

	// directDialContext handles SSRF-protected direct connection (no proxy).
	// It resolves DNS locally, checks resolved IPs against the SSRF blocklist,
	// then dials the vetted IP directly to prevent DNS rebinding.
	directDialContext := func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, err
		}
		for _, ip := range ips {
			if blockedFetchIP(ip.IP) {
				return nil, fmt.Errorf("refusing to fetch internal address %s (resolves to %s)", host, ip.IP)
			}
		}
		return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
	}

	tr := &http.Transport{
		DialContext: directDialContext,
	}

	if proxyURL != "" {
		pu, err := url.Parse(proxyURL)
		if err == nil && pu.Host != "" {
			switch pu.Scheme {
			case "http", "https":
				// HTTP CONNECT: dial proxy → send CONNECT with the ORIGINAL
				// hostname (not a locally-resolved IP) so the proxy handles DNS.
				// This is essential for users whose local DNS is blocked (GFW).
				// SSRF protection: IP literals are checked directly; domain names
				// go through the trusted proxy which resolves them.
				proxyDialer := dialer
				tr.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
					host, port, err := net.SplitHostPort(addr)
					if err != nil {
						return nil, err
					}
					// SSRF check on IP literals only — domain names go through
					// the trusted proxy which resolves them on the remote side.
					if ip := net.ParseIP(host); ip != nil {
						if blockedFetchIP(ip) {
							return nil, fmt.Errorf("refusing to fetch internal address %s (resolves to %s)", host, ip)
						}
					}
					// Dial the proxy (proxy address is never an SSRF target — the
					// user configured it, and it's almost certainly an IP or a
					// resolvable hostname reachable from the local network).
					proxyConn, err := proxyDialer.DialContext(ctx, "tcp", pu.Host)
					if err != nil {
						return nil, fmt.Errorf("connect to proxy %s: %w", pu.Host, err)
					}
					// CONNECT the ORIGINAL hostname through the proxy, letting
					// the proxy resolve DNS on the remote side. If this is an IP
					// literal we already vetted it above.
					targetAddr := net.JoinHostPort(host, port)
					connectReq := &http.Request{
						Method: http.MethodConnect,
						URL:    &url.URL{Host: targetAddr},
						Host:   targetAddr,
						Header: make(http.Header),
					}
					if pu.User != nil {
						user := pu.User.Username()
						pass, _ := pu.User.Password()
						auth := base64.StdEncoding.EncodeToString([]byte(user + ":" + pass))
						connectReq.Header.Set("Proxy-Authorization", "Basic "+auth)
					}
					if err := connectReq.Write(proxyConn); err != nil {
						proxyConn.Close()
						return nil, fmt.Errorf("write CONNECT to proxy: %w", err)
					}
					br := bufio.NewReader(proxyConn)
					resp, err := http.ReadResponse(br, connectReq)
					if err != nil {
						proxyConn.Close()
						return nil, fmt.Errorf("read CONNECT response: %w", err)
					}
					if resp.StatusCode != http.StatusOK {
						proxyConn.Close()
						return nil, fmt.Errorf("proxy CONNECT failed: %s", resp.Status)
					}
					return proxyConn, nil
				}
				tr.Proxy = nil

			case "socks5", "socks5h":
				// Tunnel through SOCKS5. Dial the trusted proxy with a plain
				// dialer (a proxy on a private/LAN address must not be rejected
				// by the SSRF guard), then route the target through it. IP-literal
				// targets are still SSRF-checked; hostnames are resolved by the
				// proxy — the same boundary as the HTTP CONNECT path above.
				var auth *proxy.Auth
				if pu.User != nil {
					pass, _ := pu.User.Password()
					auth = &proxy.Auth{User: pu.User.Username(), Password: pass}
				}
				if sd, err := proxy.SOCKS5("tcp", pu.Host, auth, dialer); err == nil {
					if cd, ok := sd.(proxy.ContextDialer); ok {
						tr.Proxy = nil
						tr.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
							host, _, err := net.SplitHostPort(addr)
							if err != nil {
								return nil, err
							}
							if ip := net.ParseIP(host); ip != nil && blockedFetchIP(ip) {
								return nil, fmt.Errorf("refusing to fetch internal address %s (resolves to %s)", host, ip)
							}
							return cd.DialContext(ctx, network, addr)
						}
					}
				}
			}
		}
	}

	return tr
}

type webFetchRoundTripper struct {
	wf     webFetch
	grants *webFetchCallGrants
}

func (rt webFetchRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	proxyURL, err := rt.wf.proxyURLFor(req)
	if err != nil {
		return nil, fmt.Errorf("resolve proxy: %w", err)
	}
	ips, err := rt.wf.resolveTarget(req.Context(), req.URL.Hostname())
	if err != nil {
		// A configured proxy may be the only resolver for public internet names.
		// Preserve that path; private IP literals and locally-resolved private
		// names still go through the approval checks below.
		if proxyURL != "" && net.ParseIP(req.URL.Hostname()) == nil {
			return ssrfGuardedTransport(proxyURL).RoundTrip(req)
		}
		return nil, err
	}
	port, err := webFetchURLPort(req.URL)
	if err != nil {
		return nil, err
	}
	for _, resolved := range ips {
		if hardBlockedFetchIP(resolved.IP) {
			return nil, fmt.Errorf("refusing to fetch internal address %s (resolves to %s)", req.URL.Hostname(), resolved.IP)
		}
	}

	privateIPs := make([]net.IPAddr, 0, len(ips))
	for _, resolved := range ips {
		ip := resolved.IP
		if !authorizablePrivateFetchIP(ip) {
			continue
		}
		privateIPs = append(privateIPs, resolved)
		if err := rt.authorizePrivateTarget(req, ip, port); err != nil {
			return nil, err
		}
	}
	if len(privateIPs) > 0 {
		return rt.wf.pinnedDirectTransport(privateIPs).RoundTrip(req)
	}
	return ssrfGuardedTransport(proxyURL).RoundTrip(req)
}

func (rt webFetchRoundTripper) authorizePrivateTarget(req *http.Request, ip net.IP, port int) error {
	host := normalizeTrustedIntranetHost(req.URL.Hostname())
	grantKey := trustedIntranetGrantKey(host, ip.String(), port)
	if rt.wf.trustedIntranet.Allows(host, ip, port) || rt.grants.allowed(grantKey) {
		return nil
	}
	approvalReq := tool.TrustedIntranetRequest{URL: req.URL.String(), Host: host, IP: ip.String(), Port: port}
	approver, ok := tool.TrustedIntranetApproverFrom(req.Context())
	if !ok {
		return fmt.Errorf("refusing to fetch internal address %s (resolves to %s): trusted intranet access requires user approval", host, ip)
	}
	if approver.TrustedIntranetSessionAllowed(req.Context(), approvalReq) {
		rt.grants.grant(grantKey)
		return nil
	}
	allow, reason, err := approver.ApproveTrustedIntranet(req.Context(), approvalReq)
	if err != nil {
		return fmt.Errorf("trusted intranet approval for %s: %w", host, err)
	}
	if !allow {
		if strings.TrimSpace(reason) == "" {
			reason = "user declined trusted intranet access"
		}
		return fmt.Errorf("trusted intranet access to %s declined: %s", host, reason)
	}
	rt.grants.grant(grantKey)
	return nil
}

func ssrfGuardedClient(wf webFetch) *http.Client {
	return &http.Client{
		Timeout:   webFetchTimeout,
		Transport: webFetchRoundTripper{wf: wf, grants: &webFetchCallGrants{allowedKeys: map[string]bool{}}},
	}
}

type webFetchCallGrants struct {
	mu          sync.Mutex
	allowedKeys map[string]bool
}

func (g *webFetchCallGrants) allowed(key string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.allowedKeys[key]
}

func (g *webFetchCallGrants) grant(key string) {
	g.mu.Lock()
	g.allowedKeys[key] = true
	g.mu.Unlock()
}

func trustedIntranetGrantKey(host, ip string, port int) string {
	return fmt.Sprintf("%s|%s|%d", normalizeTrustedIntranetHost(host), ip, port)
}

func normalizeTrustedIntranetHost(host string) string {
	return strings.ToLower(strings.TrimSuffix(strings.TrimSpace(strings.Trim(host, "[]")), "."))
}

func (p TrustedIntranetPolicy) Allows(host string, ip net.IP, port int) bool {
	if !p.Enabled || !authorizablePrivateFetchIP(ip) {
		return false
	}
	host = normalizeTrustedIntranetHost(host)
	for _, site := range p.Sites {
		if normalizeTrustedIntranetHost(site.Host) != host || !intListContains(site.Ports, port) {
			continue
		}
		for _, raw := range site.CIDRs {
			_, network, err := net.ParseCIDR(strings.TrimSpace(raw))
			if err == nil && network.Contains(ip) {
				return true
			}
		}
	}
	return false
}

func intListContains(values []int, want int) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func webFetchURLPort(u *url.URL) (int, error) {
	if raw := u.Port(); raw != "" {
		port, err := strconv.Atoi(raw)
		if err != nil || port < 1 || port > 65535 {
			return 0, fmt.Errorf("invalid URL port %q", raw)
		}
		return port, nil
	}
	if u.Scheme == "https" {
		return 443, nil
	}
	return 80, nil
}

func (wf webFetch) resolveTarget(ctx context.Context, host string) ([]net.IPAddr, error) {
	if ip := net.ParseIP(strings.Trim(host, "[]")); ip != nil {
		return []net.IPAddr{{IP: ip}}, nil
	}
	lookup := wf.lookupIP
	if lookup == nil {
		lookup = net.DefaultResolver.LookupIPAddr
	}
	ips, err := lookup(ctx, host)
	if err != nil {
		return nil, err
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("host %s resolved to no addresses", host)
	}
	return ips, nil
}

func (wf webFetch) pinnedDirectTransport(ips []net.IPAddr) *http.Transport {
	dial := wf.dialContext
	if dial == nil {
		dial = (&net.Dialer{Timeout: webFetchTimeout}).DialContext
	}
	return &http.Transport{DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
		_, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		if len(ips) == 0 {
			return nil, fmt.Errorf("no vetted address available")
		}
		return dial(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
	}}
}

// cgnatRange is RFC 6598 shared address space (100.64.0.0/10). Go's IsPrivate
// doesn't cover it, yet some clouds host instance metadata there (Alibaba Cloud
// at 100.100.100.200), so it's an SSRF target web_fetch must refuse too.
var cgnatRange = mustCIDR("100.64.0.0/10")

func mustCIDR(s string) *net.IPNet {
	_, n, err := net.ParseCIDR(s)
	if err != nil {
		panic(err)
	}
	return n
}

// blockedFetchIP reports whether ip is an address web_fetch must not reach.
func blockedFetchIP(ip net.IP) bool {
	return authorizablePrivateFetchIP(ip) || hardBlockedFetchIP(ip)
}

func authorizablePrivateFetchIP(ip net.IP) bool {
	return ip != nil && ip.IsPrivate() && !ip.IsLoopback()
}

func hardBlockedFetchIP(ip net.IP) bool {
	return ip == nil || ip.IsLinkLocalUnicast() || // 169.254.0.0/16 (incl. cloud metadata) + fe80::/10
		ip.IsLinkLocalMulticast() ||
		ip.IsUnspecified() || // 0.0.0.0 / ::
		cgnatRange.Contains(ip) // 100.64.0.0/10 (incl. Alibaba Cloud metadata)
}

func (wf webFetch) proxyURLFor(req *http.Request) (string, error) {
	pf, err := netclient.ProxyFunc(wf.proxySpec)
	if err != nil {
		return "", err
	}
	if pf == nil {
		return "", nil
	}
	u, err := pf(req)
	if err != nil || u == nil {
		return "", err
	}
	return u.String(), nil
}

func (wf webFetch) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	var p struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(args, &p); err != nil {
		return "", fmt.Errorf("invalid args: %w", err)
	}
	if p.URL == "" {
		return "", fmt.Errorf("url is required")
	}
	u, err := url.Parse(p.URL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return "", fmt.Errorf("url must be an absolute http(s) address")
	}

	reqCtx, cancel := context.WithTimeout(ctx, webFetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, p.URL, nil)
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}
	// A plain UA + Accept tip the server toward returning text/HTML rather
	// than minified asset bundles or binary content.
	req.Header.Set("User-Agent", "voltui-web-fetch/1.0")
	req.Header.Set("Accept", "text/html,text/plain,text/markdown,application/json,*/*;q=0.5")

	resp, err := ssrfGuardedClient(wf).Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch %s: %w", p.URL, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, webFetchMaxRead))
	if err != nil {
		return "", fmt.Errorf("read body: %w", err)
	}

	ct := strings.ToLower(resp.Header.Get("Content-Type"))
	out := string(body)
	if strings.Contains(ct, "text/html") || looksLikeHTML(out) {
		out = htmlToText(out)
	}
	out = strings.TrimSpace(out)
	if out == "" {
		return fmt.Sprintf("(empty body — status %s)", resp.Status), nil
	}
	header := fmt.Sprintf("status %s · %s · %d bytes\n\n", resp.Status, contentTypeShort(ct), len(body))
	return header + out, nil
}

// looksLikeHTML lets servers that misreport Content-Type still hit the HTML
// reducer — GitHub raw pages and many docs sites lie about content type.
func looksLikeHTML(s string) bool {
	head := s
	if len(head) > 512 {
		head = head[:512]
	}
	low := strings.ToLower(head)
	return strings.Contains(low, "<!doctype html") || strings.Contains(low, "<html")
}

var (
	scriptStyle = regexp.MustCompile(`(?is)<(script|style)[^>]*>.*?</(?:script|style)>`)
	htmlComment = regexp.MustCompile(`(?s)<!--.*?-->`)
	anyTag      = regexp.MustCompile(`(?s)<[^>]+>`)
	multiBlank  = regexp.MustCompile(`\n[\t ]*\n([\t ]*\n)+`)
	trailingWS  = regexp.MustCompile(`[\t ]+\n`)
)

// htmlToText strips <script>/<style> blocks, HTML comments, and every other
// tag, then unescapes the common entities and collapses runs of blank lines.
// It is intentionally lossy — we want to give the model readable text rather
// than preserve structure for re-rendering.
func htmlToText(s string) string {
	s = scriptStyle.ReplaceAllString(s, "")
	s = htmlComment.ReplaceAllString(s, "")
	s = anyTag.ReplaceAllString(s, "")

	// Unescape the entities the model is most likely to encounter. Avoids
	// pulling in html.UnescapeString just to handle five characters.
	repl := strings.NewReplacer(
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", `"`,
		"&#39;", "'",
		"&apos;", "'",
		"&nbsp;", " ",
	)
	s = repl.Replace(s)

	s = trailingWS.ReplaceAllString(s, "\n")
	s = multiBlank.ReplaceAllString(s, "\n\n")
	return s
}

func contentTypeShort(ct string) string {
	if i := strings.IndexByte(ct, ';'); i >= 0 {
		ct = ct[:i]
	}
	return strings.TrimSpace(ct)
}
