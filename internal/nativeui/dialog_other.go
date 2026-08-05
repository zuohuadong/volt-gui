//go:build !windows

package nativeui

// ShowError is a no-op where the Windows native dialog is unavailable.
func ShowError(string, string) {}
