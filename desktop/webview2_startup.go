package main

import (
	"context"
	goruntime "runtime"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const windowsWebView2StartupFallbackDelay = 15 * time.Second

const windowsWebView2StartupFallbackMessage = "The desktop interface did not become ready within 15 seconds. " +
	"An unavailable Windows system proxy or a WebView2 failure may be blocking startup. " +
	"Check the system proxy and WebView2 Runtime, then restart Volt GUI.\n\n" +
	"桌面界面在 15 秒内未能就绪。不可用的 Windows 系统代理或 WebView2 故障可能阻塞了启动。" +
	"请检查系统代理和 WebView2 Runtime 后重启 Volt GUI。"

// startWindowsWebView2StartupFallback prevents StartHidden from turning a slow
// or failed WebView2 navigation into an apparently missing application.
func (a *App) startWindowsWebView2StartupFallback(ctx context.Context) {
	if !shouldStartWindowsWebView2StartupFallback(goruntime.GOOS) {
		return
	}
	go func() {
		timer := time.NewTimer(windowsWebView2StartupFallbackDelay)
		defer timer.Stop()
		if !awaitStartupFallback(ctx, timer.C, a.startupReady.Load) {
			return
		}

		// Show the shell before opening the dialog so a dialog failure cannot
		// leave the process completely invisible.
		runtime.WindowShow(ctx)
		if a.startupReady.Load() {
			return
		}
		_, _ = runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
			Type:          runtime.WarningDialog,
			Title:         "Volt GUI startup delayed / Volt GUI 启动延迟",
			Message:       windowsWebView2StartupFallbackMessage,
			Buttons:       []string{"OK"},
			DefaultButton: "OK",
		})
	}()
}

func shouldStartWindowsWebView2StartupFallback(goos string) bool {
	return goos == "windows"
}

func awaitStartupFallback(ctx context.Context, timeout <-chan time.Time, ready func() bool) bool {
	select {
	case <-ctx.Done():
		return false
	case <-timeout:
		return !ready()
	}
}
