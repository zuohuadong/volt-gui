# 西谷智灯暗涌系统 project memory

This file is loaded into every session's system prompt (the cache-stable prefix),
so keep it concise and durable — it is the project's standing instructions to the
agent. It is the VoltUI analog of Claude Code's CLAUDE.md.

## Fork Identity

- **Project**: 西谷AI 西谷智灯暗涌系统 (Xigu AI Anyong System)
- **Upstream**: [VoltUI](https://cnb.cool/aizhuliren/volt-gui) (Go CLI/TUI + Electron/DSH/Svelte 5)
- **Brand mechanism**: `[brand]` config section + `VOLTUI_BRAND_NAME` env var
- **Constraint**: NEVER hard-code brand name into source code. Use BrandConfig only.
- **Fork-only files**: `.cnb.yml`, `暗涌.md`, `references/skills/{anyong-brand-config,cnb-ci-cd,xigu-ai-ops}/`

## Conventions

- Go kernel under `internal/`; each package owns one concern and documents it in a
  package comment. Match the surrounding comment density and idiom when editing.
- Go CLI/TUI and HTTP/SSE behavior belongs behind the transport-agnostic
  `control.Controller`. Electron desktop uses the separate DSH runtime and must
  not depend on retired Wails bindings.
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
