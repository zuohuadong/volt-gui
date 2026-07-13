package main

import (
	"testing"

	"voltui/internal/config"
)

func TestSettingsListsAndRemovesPermanentTrustedIntranetSite(t *testing.T) {
	isolateDesktopUserDirs(t)
	path := config.UserConfigPath()
	cfg := config.LoadForEditWithoutCredentials(path)
	if _, err := cfg.AddTrustedIntranetSite("lims.xigu.org", "192.168.1.14", 443); err != nil {
		t.Fatal(err)
	}
	if err := cfg.SaveTo(path); err != nil {
		t.Fatal(err)
	}

	app := NewApp()
	view := app.Settings()
	if !view.Network.TrustedIntranet.Enabled || len(view.Network.TrustedIntranet.Sites) != 1 {
		t.Fatalf("Settings().Network.TrustedIntranet = %#v", view.Network.TrustedIntranet)
	}
	site := view.Network.TrustedIntranet.Sites[0]
	if site.Host != "lims.xigu.org" || len(site.CIDRs) != 1 || site.CIDRs[0] != "192.168.1.14/32" || len(site.Ports) != 1 || site.Ports[0] != 443 {
		t.Fatalf("trusted site view = %#v", site)
	}
	if err := app.RemoveTrustedIntranetSite(site); err != nil {
		t.Fatalf("RemoveTrustedIntranetSite: %v", err)
	}
	after := config.LoadForViewWithoutCredentials(path)
	if after.Network.TrustedIntranet.Enabled || len(after.Network.TrustedIntranet.Sites) != 0 {
		t.Fatalf("trusted intranet after removal = %#v", after.Network.TrustedIntranet)
	}
}
