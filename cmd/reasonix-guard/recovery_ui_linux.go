//go:build linux

package main

import (
	"errors"
	"os/exec"
	"strings"
)

func nativeRecoveryChoice() recoveryChoice {
	if path, err := exec.LookPath("zenity"); err == nil {
		cmd := exec.Command(path, "--question", "--title=VoltUI Recovery",
			"--text=VoltUI failed to start repeatedly.",
			"--ok-label=Repair and Start", "--cancel-label=Safe Mode", "--extra-button=Quit")
		out, err := cmd.Output()
		if strings.TrimSpace(string(out)) == "Quit" {
			return recoveryQuit
		}
		if err == nil {
			return recoveryRepair
		}
		return recoverySafeMode
	}
	if path, err := exec.LookPath("kdialog"); err == nil {
		err := exec.Command(path, "--warningyesnocancel", "VoltUI failed to start repeatedly. Repair configuration and start?", "--title", "VoltUI Recovery").Run()
		if err == nil {
			return recoveryRepair
		}
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) && exitErr.ExitCode() == 2 {
			return recoveryQuit
		}
	}
	return recoverySafeMode
}
