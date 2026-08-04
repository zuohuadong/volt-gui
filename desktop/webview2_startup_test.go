package main

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"
)

func TestAppStartupArmsWindowsWebView2Fallback(t *testing.T) {
	source, err := os.ReadFile("app.go")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(source), "a.startWindowsWebView2StartupFallback(ctx)") {
		t.Fatal("App.startup does not arm the Windows WebView2 visibility fallback")
	}
}

func TestWindowsWebView2StartupFallbackScope(t *testing.T) {
	if !shouldStartWindowsWebView2StartupFallback("windows") {
		t.Fatal("Windows startup fallback is disabled")
	}
	if shouldStartWindowsWebView2StartupFallback("darwin") {
		t.Fatal("startup fallback must not run outside Windows")
	}
}

func TestAwaitStartupFallback(t *testing.T) {
	timeout := make(chan time.Time, 1)
	timeout <- time.Now()
	if !awaitStartupFallback(context.Background(), timeout, func() bool { return false }) {
		t.Fatal("startup fallback did not fire after timeout")
	}

	timeout <- time.Now()
	if awaitStartupFallback(context.Background(), timeout, func() bool { return true }) {
		t.Fatal("startup fallback fired after domReady")
	}
}

func TestAwaitStartupFallbackStopsWithApplication(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if awaitStartupFallback(ctx, make(chan time.Time), func() bool { return false }) {
		t.Fatal("startup fallback fired after application shutdown")
	}
}
