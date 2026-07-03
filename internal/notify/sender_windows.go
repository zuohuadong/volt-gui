//go:build windows

package notify

import (
	"os/exec"

	"git.sr.ht/~jackmordaunt/go-toast/v2"
)

// PlatformSender delivers notifications through the Windows Toast API.
type PlatformSender struct{}

// NewPlatformSender returns the best-effort sender for the current platform.
func NewPlatformSender() PlatformSender {
	_ = toast.SetAppData(toast.AppData{AppID: "Reasonix"})
	return PlatformSender{}
}

func (PlatformSender) Send(m Message) error {
	notification := toast.Notification{
		AppID: "Reasonix",
		Title: m.Title,
		Body:  m.Body,
	}
	if err := notification.Push(); err == nil {
		return nil
	}
	return sendPowerShellFallback(m)
}

func sendPowerShellFallback(m Message) error {
	cmd := exec.Command("powershell", "-NoProfile", "-Command", `
if (Get-Command New-BurntToastNotification -ErrorAction SilentlyContinue) {
  New-BurntToastNotification -Text $args[0], $args[1]
} elseif (Get-Command msg -ErrorAction SilentlyContinue) {
  msg $env:USERNAME ($args[0] + ': ' + $args[1])
}
`, m.Title, m.Body)
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { _ = cmd.Wait() }()
	return nil
}
