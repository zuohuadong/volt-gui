# 暗涌 project memory

This file is loaded into every session's system prompt (the cache-stable prefix),
so keep it concise and durable — it is the project's standing instructions to the
agent. It is the VoltUI analog of Claude Code's CLAUDE.md.

## Fork Identity

- **Project**: 西谷AI 暗涌系统 (Xigu AI Anyong System)
- **Upstream**: [VoltUI](https://cnb.cool/aizhuliren/volt-gui) (Go + Wails)
- **Brand mechanism**: `[brand]` config section + `VOLTUI_BRAND_NAME` env var
- **Constraint**: NEVER hard-code brand name into source code. Use BrandConfig only.
- **Fork-only files**: `.cnb.yml`, `scripts/sync-upstream.sh`, `暗涌.md`, `references/skills/{anyong-brand-config,cnb-ci-cd,xigu-ai-ops}/`

## Conventions

- Go kernel under `internal/`; each package owns one concern and documents it in a
  package comment. Match the surrounding comment density and idiom when editing.
- One transport-agnostic `control.Controller` sits behind every frontend (chat
  TUI, HTTP/SSE serve, Wails desktop). Add behavior to the controller, not a
  frontend, so all three inherit it.
- Cache-first: the system-prompt prefix (base prompt + tools + memory) must stay
  byte-stable across turns so DeepSeek's automatic prefix cache stays warm. Never
  mutate it mid-session — ride the turn tail instead (see `control.Compose`).

## Memory

- Hierarchical docs: `VOLTUI.md` (this file, committed/shared), `VOLTUI.local.md`
  (personal, git-ignored), user-global `~/.config/voltui/VOLTUI.md`, and any
  `VOLTUI.md` in an ancestor dir. `AGENTS.md` is accepted as a fallback name.
- `@path` on its own line imports another file's contents.
- `#<note>` in chat quick-adds a line here. The `remember` tool saves durable
  facts to the per-project auto-memory store (frontmatter files + `MEMORY.md`
  index), which loads into the prefix on the next session.

## Notes