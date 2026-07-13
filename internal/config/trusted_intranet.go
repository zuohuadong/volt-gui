package config

import (
	"fmt"
	"net"
	"net/netip"
	"sort"
	"strings"
)

var trustedIntranetPrivatePrefixes = []netip.Prefix{
	netip.MustParsePrefix("10.0.0.0/8"),
	netip.MustParsePrefix("172.16.0.0/12"),
	netip.MustParsePrefix("192.168.0.0/16"),
	netip.MustParsePrefix("fc00::/7"),
}

func authorizablePrivatePrefix(prefix netip.Prefix) bool {
	prefix = prefix.Masked()
	for _, base := range trustedIntranetPrivatePrefixes {
		if prefix.Addr().BitLen() == base.Addr().BitLen() && prefix.Bits() >= base.Bits() && base.Contains(prefix.Addr()) {
			return true
		}
	}
	return false
}

func normalizeTrustedIntranetHost(host string) (string, error) {
	host = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(host), "."))
	host = strings.Trim(host, "[]")
	if host == "" || strings.ContainsAny(host, "*/\\ ") || strings.Contains(host, "://") {
		return "", fmt.Errorf("invalid trusted intranet host %q", host)
	}
	return host, nil
}

func exactPrivateCIDR(ipText string) (string, error) {
	ip := net.ParseIP(strings.TrimSpace(ipText))
	if ip == nil {
		return "", fmt.Errorf("invalid trusted intranet IP %q", ipText)
	}
	if !ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
		return "", fmt.Errorf("trusted intranet IP %s is not an authorizable private address", ip)
	}
	if v4 := ip.To4(); v4 != nil {
		return v4.String() + "/32", nil
	}
	return ip.String() + "/128", nil
}

func normalizeTrustedIntranetSite(site TrustedIntranetSiteConfig) (TrustedIntranetSiteConfig, error) {
	host, err := normalizeTrustedIntranetHost(site.Host)
	if err != nil {
		return TrustedIntranetSiteConfig{}, err
	}
	cidrs := make([]string, 0, len(site.CIDRs))
	seenCIDR := map[string]bool{}
	for _, raw := range site.CIDRs {
		prefix, err := netip.ParsePrefix(strings.TrimSpace(raw))
		if err != nil {
			return TrustedIntranetSiteConfig{}, fmt.Errorf("invalid trusted intranet CIDR %q", raw)
		}
		if !authorizablePrivatePrefix(prefix) {
			return TrustedIntranetSiteConfig{}, fmt.Errorf("trusted intranet CIDR %q is not contained by RFC1918 or IPv6 ULA space", raw)
		}
		normalized := prefix.Masked().String()
		if !seenCIDR[normalized] {
			seenCIDR[normalized] = true
			cidrs = append(cidrs, normalized)
		}
	}
	if len(cidrs) == 0 {
		return TrustedIntranetSiteConfig{}, fmt.Errorf("trusted intranet site %q requires at least one CIDR", host)
	}
	ports := make([]int, 0, len(site.Ports))
	seenPort := map[int]bool{}
	for _, port := range site.Ports {
		if port < 1 || port > 65535 {
			return TrustedIntranetSiteConfig{}, fmt.Errorf("invalid trusted intranet port %d", port)
		}
		if !seenPort[port] {
			seenPort[port] = true
			ports = append(ports, port)
		}
	}
	if len(ports) == 0 {
		return TrustedIntranetSiteConfig{}, fmt.Errorf("trusted intranet site %q requires at least one port", host)
	}
	sort.Strings(cidrs)
	sort.Ints(ports)
	return TrustedIntranetSiteConfig{Host: host, CIDRs: cidrs, Ports: ports}, nil
}

func trustedIntranetSitesEqual(a, b TrustedIntranetSiteConfig) bool {
	if a.Host != b.Host || len(a.CIDRs) != len(b.CIDRs) || len(a.Ports) != len(b.Ports) {
		return false
	}
	for i := range a.CIDRs {
		if a.CIDRs[i] != b.CIDRs[i] {
			return false
		}
	}
	for i := range a.Ports {
		if a.Ports[i] != b.Ports[i] {
			return false
		}
	}
	return true
}

// AddTrustedIntranetSite persists the narrowest possible grant: one exact host,
// one exact /32 or /128 address, and one concrete port.
func (c *Config) AddTrustedIntranetSite(host, ip string, port int) (bool, error) {
	if c == nil {
		return false, fmt.Errorf("nil config")
	}
	cidr, err := exactPrivateCIDR(ip)
	if err != nil {
		return false, err
	}
	site, err := normalizeTrustedIntranetSite(TrustedIntranetSiteConfig{Host: host, CIDRs: []string{cidr}, Ports: []int{port}})
	if err != nil {
		return false, err
	}
	for _, existing := range c.Network.TrustedIntranet.Sites {
		normalized, err := normalizeTrustedIntranetSite(existing)
		if err == nil && trustedIntranetSitesEqual(normalized, site) {
			c.Network.TrustedIntranet.Enabled = true
			return false, nil
		}
	}
	c.Network.TrustedIntranet.Enabled = true
	c.Network.TrustedIntranet.Sites = append(c.Network.TrustedIntranet.Sites, site)
	return true, nil
}

// RemoveTrustedIntranetSite removes one exact persisted site entry.
func (c *Config) RemoveTrustedIntranetSite(site TrustedIntranetSiteConfig) bool {
	if c == nil {
		return false
	}
	want, err := normalizeTrustedIntranetSite(site)
	if err != nil {
		return false
	}
	for i, existing := range c.Network.TrustedIntranet.Sites {
		got, err := normalizeTrustedIntranetSite(existing)
		if err != nil || !trustedIntranetSitesEqual(got, want) {
			continue
		}
		c.Network.TrustedIntranet.Sites = append(c.Network.TrustedIntranet.Sites[:i], c.Network.TrustedIntranet.Sites[i+1:]...)
		if len(c.Network.TrustedIntranet.Sites) == 0 {
			c.Network.TrustedIntranet.Enabled = false
		}
		return true
	}
	return false
}

// TrustedIntranetSites returns normalized, valid user grants. Invalid legacy or
// hand-edited entries fail closed and are omitted.
func (c *Config) TrustedIntranetSites() []TrustedIntranetSiteConfig {
	if c == nil || !c.Network.TrustedIntranet.Enabled {
		return nil
	}
	out := make([]TrustedIntranetSiteConfig, 0, len(c.Network.TrustedIntranet.Sites))
	for _, site := range c.Network.TrustedIntranet.Sites {
		normalized, err := normalizeTrustedIntranetSite(site)
		if err == nil {
			out = append(out, normalized)
		}
	}
	return out
}

func (c *Config) TrustedIntranetAllows(host, ipText string, port int) bool {
	host, err := normalizeTrustedIntranetHost(host)
	if err != nil {
		return false
	}
	ip := net.ParseIP(strings.TrimSpace(ipText))
	if ip == nil || !ip.IsPrivate() {
		return false
	}
	for _, site := range c.TrustedIntranetSites() {
		if site.Host != host || !containsInt(site.Ports, port) {
			continue
		}
		for _, raw := range site.CIDRs {
			_, network, err := net.ParseCIDR(raw)
			if err == nil && network.Contains(ip) {
				return true
			}
		}
	}
	return false
}

func containsInt(values []int, want int) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
