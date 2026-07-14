package netclient

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"
)

// GuardedDialer resolves a hostname once, rejects every unsafe answer, then
// dials a vetted IP directly. Pinning the connection to the checked address
// prevents a second DNS lookup from turning into a rebinding bypass.
type GuardedDialer struct {
	Timeout       time.Duration
	KeepAlive     time.Duration
	AllowLoopback bool
	LookupIP      func(context.Context, string) ([]net.IPAddr, error)
	Dial          func(context.Context, string, string) (net.Conn, error)
}

func (d GuardedDialer) DialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	host = strings.Trim(host, "[]")
	var ips []net.IPAddr
	if ip := net.ParseIP(host); ip != nil {
		ips = []net.IPAddr{{IP: ip}}
	} else {
		lookup := d.LookupIP
		if lookup == nil {
			lookup = net.DefaultResolver.LookupIPAddr
		}
		ips, err = lookup(ctx, host)
		if err != nil {
			return nil, err
		}
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("host %s resolved to no addresses", host)
	}
	for _, resolved := range ips {
		if IsBlockedAddress(resolved.IP, d.AllowLoopback) {
			return nil, fmt.Errorf("refusing to fetch internal address %s (resolves to %s)", host, resolved.IP)
		}
	}

	selected := ips[0].IP
	for _, resolved := range ips {
		if network == "tcp4" && resolved.IP.To4() != nil {
			selected = resolved.IP
			break
		}
		if network == "tcp6" && resolved.IP.To4() == nil {
			selected = resolved.IP
			break
		}
	}
	dial := d.Dial
	if dial == nil {
		dial = (&net.Dialer{Timeout: d.Timeout, KeepAlive: d.KeepAlive}).DialContext
	}
	return dial(ctx, network, net.JoinHostPort(selected.String(), port))
}

var cgnatRange = mustAddressCIDR("100.64.0.0/10")

func mustAddressCIDR(raw string) *net.IPNet {
	_, network, err := net.ParseCIDR(raw)
	if err != nil {
		panic(err)
	}
	return network
}

// IsPrivateAddress reports private RFC1918/RFC4193 space that web_fetch may
// separately authorize. Loopback is intentionally classified by the hard
// policy so callers can preserve the web_fetch localhost compatibility rule.
func IsPrivateAddress(ip net.IP) bool {
	return ip != nil && ip.IsPrivate() && !ip.IsLoopback()
}

// IsHardBlockedAddress covers addresses that must never be remotely fetched.
// allowLoopback exists only for web_fetch compatibility; media ingestion and
// other untrusted URL consumers should pass false.
func IsHardBlockedAddress(ip net.IP, allowLoopback bool) bool {
	if ip == nil || ip.IsUnspecified() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() || cgnatRange.Contains(ip) {
		return true
	}
	return ip.IsLoopback() && !allowLoopback
}

// IsBlockedAddress applies both private-address and hard-block policies.
func IsBlockedAddress(ip net.IP, allowLoopback bool) bool {
	return IsPrivateAddress(ip) || IsHardBlockedAddress(ip, allowLoopback)
}
