package permission

import (
	"strings"

	"voltui/internal/shellparse"
)

type bashApprovalClass uint8

const (
	bashApprovalReusable bashApprovalClass = iota
	bashApprovalExactOnly
	bashApprovalRequireHuman
)

// BashSubjectRequiresExplicitApproval reports whether subject can execute a
// nested or indirect command and therefore needs a human in Ask/Auto. Exact
// command rules are handled separately by Policy before this classification.
func BashSubjectRequiresExplicitApproval(subject string) bool {
	return classifyBashApproval(subject) == bashApprovalRequireHuman
}

func bashSubjectRequiresExactRule(subject string) bool {
	return classifyBashApproval(subject) != bashApprovalReusable
}

func classifyBashApproval(subject string) bashApprovalClass {
	if strings.TrimSpace(subject) == "" {
		return bashApprovalReusable
	}
	segments, _, ok := shellparse.SplitTopLevel(subject)
	if !ok {
		return classifyBashSegmentApproval(subject)
	}
	if len(segments) == 0 {
		return bashApprovalRequireHuman
	}
	class := bashApprovalReusable
	for _, segment := range segments {
		segmentClass := classifyBashSegmentApproval(segment)
		if segmentClass > class {
			class = segmentClass
		}
		if class == bashApprovalRequireHuman {
			break
		}
	}
	return class
}

func classifyBashSegmentApproval(subject string) bashApprovalClass {
	if normalized, ok := normalizeBashSafeRedirectsForMatch(subject); ok {
		subject = normalized
	}
	features, ok := shellparse.AnalyzeApprovalFeatures(subject)
	if !ok || features.NestedExecution || features.DynamicCommandName {
		return bashApprovalRequireHuman
	}
	if len(features.CommandPrefix) > 0 && isIndirectExecution(features.CommandPrefix) {
		return bashApprovalRequireHuman
	}
	if features.Expansion || features.Assignment || features.Redirection ||
		shellparse.ContainsUnquotedGlob(subject) || hasEnvWrapperAssignment(features.CommandPrefix) {
		return bashApprovalExactOnly
	}
	return bashApprovalReusable
}

func isIndirectExecution(fields []string) bool {
	if len(fields) == 0 {
		return true
	}
	base := executableBase(fields[0])
	args := fields[1:]
	if alwaysIndirectCommands[base] {
		return true
	}
	switch base {
	case "env":
		return envWrappedCommandIsIndirect(args)
	case "builtin", "command", "exec", "nohup", "sudo":
		return wrappedCommandIsIndirect(args)
	case "bash", "dash", "fish", "ksh", "sh", "zsh":
		return hasShellCommandFlag(args)
	case "find":
		return hasAnyFoldedArg(args, "-exec", "-execdir", "-ok", "-okdir")
	}
	return hasAnyFoldedArg(args, inlineExecutionFlags[base]...)
}

var alwaysIndirectCommands = map[string]bool{
	"eval": true, "source": true, ".": true, "xargs": true,
}

var inlineExecutionFlags = map[string][]string{
	"powershell": {"-c", "-command", "-e", "-enc", "-encodedcommand"},
	"pwsh":       {"-c", "-command", "-e", "-enc", "-encodedcommand"},
	"cmd":        {"/c", "/k"},
	"node":       {"-e", "--eval", "-p", "--print"},
	"bun":        {"-e", "--eval", "-p", "--print"},
	"deno":       {"eval"},
	"python":     {"-c"},
	"python3":    {"-c"},
	"py":         {"-c"},
	"pypy":       {"-c"},
	"pypy3":      {"-c"},
	"perl":       {"-e"},
	"ruby":       {"-e"},
	"lua":        {"-e"},
	"luajit":     {"-e"},
	"r":          {"-e"},
	"rscript":    {"-e"},
	"osascript":  {"-e"},
	"php":        {"-r"},
}

func envWrappedCommandIsIndirect(args []string) bool {
	for len(args) > 0 && isEnvironmentAssignment(args[0]) {
		args = args[1:]
	}
	return wrappedCommandIsIndirect(args)
}

func wrappedCommandIsIndirect(args []string) bool {
	return len(args) == 0 || strings.HasPrefix(args[0], "-") || isIndirectExecution(args)
}

func hasEnvWrapperAssignment(fields []string) bool {
	if len(fields) < 2 || executableBase(fields[0]) != "env" {
		return false
	}
	for _, arg := range fields[1:] {
		if isEnvironmentAssignment(arg) {
			return true
		}
		if !strings.HasPrefix(arg, "-") {
			return false
		}
	}
	return false
}

func executableBase(command string) string {
	if i := strings.LastIndexAny(command, `/\\`); i >= 0 {
		command = command[i+1:]
	}
	command = strings.ToLower(command)
	return strings.TrimSuffix(command, ".exe")
}

func hasShellCommandFlag(args []string) bool {
	for _, arg := range args {
		lower := strings.ToLower(arg)
		if lower == "--" {
			return false
		}
		if lower == "--command" {
			return true
		}
		if strings.HasPrefix(lower, "-") && !strings.HasPrefix(lower, "--") && strings.Contains(lower[1:], "c") {
			return true
		}
	}
	return false
}

func hasAnyFoldedArg(args []string, candidates ...string) bool {
	for _, arg := range args {
		for _, candidate := range candidates {
			if foldedArgMatches(arg, candidate) {
				return true
			}
		}
	}
	return false
}

func foldedArgMatches(arg, candidate string) bool {
	arg = strings.ToLower(arg)
	candidate = strings.ToLower(candidate)
	if arg == candidate {
		return true
	}
	if strings.HasPrefix(candidate, "--") {
		return strings.HasPrefix(arg, candidate+"=") || strings.HasPrefix(arg, candidate+":")
	}
	if len(candidate) == 2 && strings.HasPrefix(candidate, "-") {
		return strings.HasPrefix(arg, candidate) && !strings.HasPrefix(arg, "--")
	}
	if len(candidate) == 2 && strings.HasPrefix(candidate, "/") {
		return strings.HasPrefix(arg, candidate)
	}
	return len(candidate) > 2 && strings.HasPrefix(candidate, "-") && strings.HasPrefix(arg, candidate+":")
}

func isEnvironmentAssignment(arg string) bool {
	name, _, ok := strings.Cut(arg, "=")
	if !ok || name == "" {
		return false
	}
	for i, r := range name {
		letter := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')
		digit := i > 0 && r >= '0' && r <= '9'
		if !letter && !digit && r != '_' {
			return false
		}
	}
	return true
}
