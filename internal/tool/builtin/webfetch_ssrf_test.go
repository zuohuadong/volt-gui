package builtin

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"voltui/internal/tool"
)

type trustedIntranetApproverStub struct {
	requests []tool.TrustedIntranetRequest
	allow    func(tool.TrustedIntranetRequest) bool
}

func (s *trustedIntranetApproverStub) ApproveTrustedIntranet(_ context.Context, req tool.TrustedIntranetRequest) (bool, string, error) {
	s.requests = append(s.requests, req)
	if s.allow != nil && s.allow(req) {
		return true, "", nil
	}
	return false, "user declined trusted intranet access", nil
}

func (*trustedIntranetApproverStub) TrustedIntranetSessionAllowed(context.Context, tool.TrustedIntranetRequest) bool {
	return false
}

func TestBlockedFetchIP(t *testing.T) {
	blocked := []string{
		"169.254.169.254",      // cloud metadata (link-local)
		"10.1.2.3",             // RFC1918
		"172.16.5.6",           // RFC1918
		"192.168.1.1",          // RFC1918
		"0.0.0.0",              // unspecified
		"fe80::1",              // IPv6 link-local
		"fc00::1",              // IPv6 unique-local
		"::ffff:10.0.0.1",      // IPv4-mapped private
		"100.100.100.200",      // Alibaba Cloud metadata (CGNAT)
		"100.64.0.1",           // RFC 6598 shared space
		"::ffff:100.100.100.1", // IPv4-mapped CGNAT
	}
	for _, s := range blocked {
		if !blockedFetchIP(net.ParseIP(s)) {
			t.Errorf("%s should be blocked", s)
		}
	}
	allowed := []string{"8.8.8.8", "1.1.1.1", "127.0.0.1", "::1", "93.184.216.34"}
	for _, s := range allowed {
		if blockedFetchIP(net.ParseIP(s)) {
			t.Errorf("%s should be allowed", s)
		}
	}
}

// TestWebFetchAllowsLoopback proves the guard doesn't break normal fetches: a
// loopback dev server (httptest binds 127.0.0.1) stays reachable.
func TestWebFetchAllowsLoopback(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("hello from localhost"))
	}))
	defer srv.Close()

	args, _ := json.Marshal(map[string]any{"url": srv.URL})
	out, err := webFetch{}.Execute(context.Background(), args)
	if err != nil {
		t.Fatalf("loopback fetch should succeed, got %v", err)
	}
	if !strings.Contains(out, "hello from localhost") {
		t.Fatalf("body missing: %q", out)
	}
}

// TestWebFetchRefusesLinkLocal proves a fetch aimed at the cloud-metadata
// endpoint is refused at dial time (no packet leaves the host).
func TestWebFetchRefusesLinkLocal(t *testing.T) {
	args, _ := json.Marshal(map[string]any{"url": "http://169.254.169.254/latest/meta-data/"})
	_, err := webFetch{}.Execute(context.Background(), args)
	if err == nil {
		t.Fatal("fetch to 169.254.169.254 should be refused")
	}
	if !strings.Contains(err.Error(), "169.254.169.254") {
		t.Fatalf("error should name the refused address, got %v", err)
	}
}

func TestWebFetchPrivateAddressApprovalContinuesSameCallAndDoesNotLeakToNextCall(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/start" {
			http.Redirect(w, r, "/final", http.StatusFound)
			return
		}
		_, _ = w.Write([]byte("trusted intranet body"))
	}))
	defer srv.Close()
	_, portText, err := net.SplitHostPort(srv.Listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	port, _ := strconv.Atoi(portText)
	approver := &trustedIntranetApproverStub{allow: func(req tool.TrustedIntranetRequest) bool {
		return req.Host == "lims.xigu.org" && req.IP == "192.168.1.14" && req.Port == port
	}}
	wf := webFetch{
		lookupIP: func(context.Context, string) ([]net.IPAddr, error) {
			return []net.IPAddr{{IP: net.ParseIP("192.168.1.14")}}, nil
		},
		dialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, network, srv.Listener.Addr().String())
		},
	}
	ctx := tool.WithTrustedIntranetApprover(context.Background(), approver)
	args, _ := json.Marshal(map[string]any{"url": "http://lims.xigu.org:" + portText + "/start"})
	for call := 1; call <= 2; call++ {
		out, err := wf.Execute(ctx, args)
		if err != nil {
			t.Fatalf("call %d: approved intranet fetch should continue, got %v", call, err)
		}
		if !strings.Contains(out, "trusted intranet body") {
			t.Fatalf("call %d body missing: %q", call, out)
		}
		if len(approver.requests) != call {
			t.Fatalf("call %d approval count = %d, want %d (redirect on same target reuses only the current call grant)", call, len(approver.requests), call)
		}
	}
}

func TestWebFetchPrivateAddressPolicyMatchSkipsApproval(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("permanent trusted body"))
	}))
	defer srv.Close()
	_, portText, _ := net.SplitHostPort(srv.Listener.Addr().String())
	port, _ := strconv.Atoi(portText)
	approver := &trustedIntranetApproverStub{}
	wf := webFetch{
		trustedIntranet: TrustedIntranetPolicy{Enabled: true, Sites: []TrustedIntranetSite{{Host: "lims.xigu.org", CIDRs: []string{"192.168.1.14/32"}, Ports: []int{port}}}},
		lookupIP: func(context.Context, string) ([]net.IPAddr, error) {
			return []net.IPAddr{{IP: net.ParseIP("192.168.1.14")}}, nil
		},
		dialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, network, srv.Listener.Addr().String())
		},
	}
	ctx := tool.WithTrustedIntranetApprover(context.Background(), approver)
	args, _ := json.Marshal(map[string]any{"url": "http://lims.xigu.org:" + portText})
	if _, err := wf.Execute(ctx, args); err != nil {
		t.Fatalf("persisted trusted site should fetch without prompting: %v", err)
	}
	if len(approver.requests) != 0 {
		t.Fatalf("persisted rule unexpectedly prompted: %#v", approver.requests)
	}
}

func TestWebFetchMixedPublicPrivateResolutionPinsAuthorizedPrivateIP(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("mixed resolution body"))
	}))
	defer srv.Close()
	_, portText, _ := net.SplitHostPort(srv.Listener.Addr().String())
	var dialed string
	approver := &trustedIntranetApproverStub{allow: func(req tool.TrustedIntranetRequest) bool { return req.IP == "192.168.1.14" }}
	wf := webFetch{
		lookupIP: func(context.Context, string) ([]net.IPAddr, error) {
			return []net.IPAddr{{IP: net.ParseIP("93.184.216.34")}, {IP: net.ParseIP("192.168.1.14")}}, nil
		},
		dialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			dialed = addr
			return (&net.Dialer{}).DialContext(ctx, network, srv.Listener.Addr().String())
		},
	}
	ctx := tool.WithTrustedIntranetApprover(context.Background(), approver)
	args, _ := json.Marshal(map[string]any{"url": "http://mixed.internal:" + portText})
	if _, err := wf.Execute(ctx, args); err != nil {
		t.Fatalf("mixed resolution fetch: %v", err)
	}
	if host, _, _ := net.SplitHostPort(dialed); host != "192.168.1.14" {
		t.Fatalf("pinned dial target = %q, want authorized private IP", dialed)
	}
}

func TestWebFetchHardBlockedAddressCannotBeApproved(t *testing.T) {
	approver := &trustedIntranetApproverStub{allow: func(tool.TrustedIntranetRequest) bool { return true }}
	wf := webFetch{lookupIP: func(context.Context, string) ([]net.IPAddr, error) {
		return []net.IPAddr{{IP: net.ParseIP("169.254.169.254")}}, nil
	}}
	ctx := tool.WithTrustedIntranetApprover(context.Background(), approver)
	args, _ := json.Marshal(map[string]any{"url": "http://metadata.internal/latest"})
	_, err := wf.Execute(ctx, args)
	if err == nil || !strings.Contains(err.Error(), "169.254.169.254") {
		t.Fatalf("hard-blocked metadata address error = %v", err)
	}
	if len(approver.requests) != 0 {
		t.Fatalf("hard-blocked address must not prompt: %#v", approver.requests)
	}
}

func TestWebFetchMixedPrivateAndHardBlockedResolutionRejectsBeforeApproval(t *testing.T) {
	tests := []struct {
		name string
		ips  []net.IPAddr
	}{
		{
			name: "private before link-local",
			ips: []net.IPAddr{
				{IP: net.ParseIP("192.168.1.14")},
				{IP: net.ParseIP("169.254.169.254")},
			},
		},
		{
			name: "cgnat before private",
			ips: []net.IPAddr{
				{IP: net.ParseIP("100.64.0.1")},
				{IP: net.ParseIP("192.168.1.14")},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			approver := &trustedIntranetApproverStub{allow: func(tool.TrustedIntranetRequest) bool { return true }}
			wf := webFetch{lookupIP: func(context.Context, string) ([]net.IPAddr, error) {
				return tt.ips, nil
			}}
			ctx := tool.WithTrustedIntranetApprover(context.Background(), approver)
			args, _ := json.Marshal(map[string]any{"url": "http://mixed-hard-block.internal/"})

			_, err := wf.Execute(ctx, args)
			if err == nil || !strings.Contains(err.Error(), "refusing to fetch internal address") {
				t.Fatalf("mixed hard-blocked resolution error = %v", err)
			}
			if len(approver.requests) != 0 {
				t.Fatalf("mixed hard-blocked resolution must reject before approval: %#v", approver.requests)
			}
		})
	}
}

func TestWebFetchRedirectRechecksPrivateTarget(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/start" {
			_, port, _ := net.SplitHostPort(r.Host)
			http.Redirect(w, r, "http://other.internal:"+port+"/final", http.StatusFound)
			return
		}
		_, _ = w.Write([]byte("must not be reached"))
	}))
	defer srv.Close()
	_, portText, _ := net.SplitHostPort(srv.Listener.Addr().String())
	approver := &trustedIntranetApproverStub{allow: func(req tool.TrustedIntranetRequest) bool {
		return req.Host == "lims.xigu.org"
	}}
	wf := webFetch{
		lookupIP: func(_ context.Context, host string) ([]net.IPAddr, error) {
			if host == "lims.xigu.org" {
				return []net.IPAddr{{IP: net.ParseIP("192.168.1.14")}}, nil
			}
			return []net.IPAddr{{IP: net.ParseIP("192.168.1.15")}}, nil
		},
		dialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, network, srv.Listener.Addr().String())
		},
	}
	ctx := tool.WithTrustedIntranetApprover(context.Background(), approver)
	args, _ := json.Marshal(map[string]any{"url": "http://lims.xigu.org:" + portText + "/start"})
	_, err := wf.Execute(ctx, args)
	if err == nil || !strings.Contains(err.Error(), "declined") {
		t.Fatalf("redirect to a different private target should require and honor a new decision: %v", err)
	}
	if len(approver.requests) != 2 || approver.requests[1].Host != "other.internal" {
		t.Fatalf("redirect approvals = %#v", approver.requests)
	}
}
