package main

import "testing"

func TestTrayMenuLabelsFollowLocale(t *testing.T) {
	zh := trayMenuLabels("zh", "Acme Copilot")
	if zh.openTitle != "打开" || zh.quitTitle != "退出" {
		t.Fatalf("zh labels = %#v", zh)
	}
	if zh.openTooltip != "打开 Acme Copilot 窗口" || zh.quitTooltip != "退出 Acme Copilot" {
		t.Fatalf("zh tooltips = %#v, want branded text", zh)
	}

	en := trayMenuLabels("en", "Acme Copilot")
	if en.openTitle != "Open" || en.quitTitle != "Quit" {
		t.Fatalf("en labels = %#v", en)
	}
	if en.openTooltip != "Open the Acme Copilot window" || en.quitTooltip != "Quit Acme Copilot" {
		t.Fatalf("en tooltips = %#v, want branded text", en)
	}

	other := trayMenuLabels("fr", "Acme Copilot")
	if other.openTitle != en.openTitle || other.quitTitle != en.quitTitle {
		t.Fatalf("unknown locale should fall back to English, got %#v", other)
	}
}
