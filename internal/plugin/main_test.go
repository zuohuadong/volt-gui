package plugin

import (
	"os"
	"testing"

	"go.uber.org/goleak"

	"reasonix/internal/sandbox"
)

func TestMain(m *testing.M) {
	if len(os.Args) > 1 && os.Args[1] == sandbox.WindowsHelperCommand {
		os.Exit(sandbox.RunWindowsSandboxHelper(os.Args[2:], os.Stdin, os.Stdout, os.Stderr))
	}
	// The production CLI and desktop entry points register the same dispatch.
	// Register it in the test binary so Windows MCP subprocess tests exercise
	// the real AppContainer path instead of silently falling back unconfined.
	sandbox.RegisterHelperDispatch()
	goleak.VerifyTestMain(m)
}
