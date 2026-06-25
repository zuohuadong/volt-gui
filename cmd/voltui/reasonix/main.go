// Command voltui is a config- and plugin-driven coding agent CLI.
package main

import (
	"os"

	"voltui/internal/cli"

	// Blank imports wire compile-time built-ins into their registries.
	_ "voltui/internal/provider/anthropic"
	_ "voltui/internal/provider/openai"
	_ "voltui/internal/tool/builtin"
)

// version is injected at build time via -ldflags "-X main.version=...".
var version = "dev"

func main() {
	os.Exit(cli.Run(os.Args[1:], version))
}
