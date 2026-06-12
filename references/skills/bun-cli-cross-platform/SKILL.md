---
name: bun-cli-cross-platform
description: Use when editing Bun-based CLI scripts, setup/install commands, filesystem sync, symlink/copy behavior, shell hooks, zsh or PowerShell snippets, temp sandboxes, and cross-platform path handling in agent-team setup.ts.
---

# Bun CLI Cross Platform

Use this skill for `setup.ts`, `package.json` CLI entries, install/deploy/pull/push/sync/status commands, shell hooks, and automation smoke tests.

## Safety Defaults

- Keep install/deploy idempotent.
- Prefer additive writes and explicit backups over destructive changes.
- Do not overwrite user-owned project files unless the template contract says deploy owns them.
- Preserve unrelated worktree changes.
- Never write secrets to logs or generated files.

## Path Rules

- Use `resolve()` for user-provided project paths.
- Use `join()` for path construction.
- Treat `git rev-parse --git-path ...` output as relative unless it is absolute.
- Keep local opt-out markers in Git metadata, not in the worktree.
- For temp tests, use `mkdtempSync(join(tmpdir(), prefix))` and clean up on success and failure unless `--keep` is requested.

## Bun/Node Interop

- Bun CLI scripts may use `Bun.file`, `Bun.write`, `Bun.Glob`, and `bun link`.
- Use `spawnSync` for small, deterministic external checks.
- Pass `GIT_TERMINAL_PROMPT=0` for non-interactive git commands.
- Avoid shell-specific quoting in TypeScript logic; pass argv arrays to subprocesses where possible.

## Shell Hooks

For zsh:

- Use `git rev-parse --show-toplevel` instead of checking only `./.git`.
- Quote paths.
- Convert relative `--git-path` results to project-root-relative absolute paths.
- Keep hook output short.

For PowerShell:

- Check `$LASTEXITCODE`.
- Use `Join-Path`.
- Restore location after `Push-Location`.
- Avoid assumptions about drive letters or path separators.

## Verification

After CLI edits, run the smallest useful set:

- syntax/diff check: `git diff --check`
- smoke: `bun setup.ts automation smoke`
- targeted command in a temp git repo for install/deploy/enable/disable behavior
- `bun setup.ts install` only when global symlink/hook changes need to take effect immediately
