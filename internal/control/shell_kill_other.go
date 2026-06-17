//go:build !windows

package control

import (
	"os/exec"
	"syscall"
)

// setShellKillTree makes a cancelled shell command kill its whole process group,
// not just the shell leader — otherwise a timed-out pipeline (e.g.
// !find / -name foo | grep bar) orphans the children. The child gets a new
// session (and therefore its own process group), so the negative-pid signal
// reaches every descendant without letting interactive prompts grab the TTY.
func setShellKillTree(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return nil
		}
		return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	}
}
