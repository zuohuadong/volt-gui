# Changelog

All notable changes to the Go line (VoltUI 1.0+) are recorded here. The legacy
`0.x` TypeScript history lives on the [`v1`](https://github.com/esengine/DeepSeek-Reasonix/tree/v1)
branch.

## 暗涌 Fork 版本记录

### [1.0.0-anyong] — 2026-06-12

西谷AI 暗涌系统 fork 初始化，基于 VoltUI 1.0.0 (commit 4e5b14b8)。

#### Fork 专属改动

- **`.cnb.yml`**: 添加 auto-release 管道 (约定式提交 → 自动打 tag → 触发 GitHub Actions)
  和 merge-request CI 门禁
- **`scripts/sync-upstream.sh`**: 上游改为 CNB volt-gui，不再需要品牌替换逻辑
- **品牌策略**: 从硬编码品牌替换 (65 文件) 改为 BrandConfig 配置化方案
  (`VOLTUI_BRAND_NAME=暗涌` 环境变量 / `[brand]` 配置段)
- **行业 skill**: 新增 `anyong-brand-config`、`cnb-ci-cd`、`xigu-ai-ops` 三个 fork 专属 skill
- **产品文档**: 新增 `暗涌.md` 产品策略文档
- **向上游 PR**: 已提交 [PR #1](https://cnb.cool/aizhuliren/volt-gui/-/pulls/1) 
  (feat(ci): auto-release pipeline + merge-request CI)

#### Rejected: 硬编码品牌替换 | 不可维护，每次同步上游需重新 65 文件替换

### [1.0.0] — 2026-06-03 (VoltUI upstream)

First stable release — a **ground-up rewrite in Go**. Not an upgrade of the `0.x`
TypeScript line; a new codebase that becomes the default (`main-v2`).

### Highlights

- **Go kernel**: a single static binary (CGO-free), cross-compiled for
  darwin/linux/windows on amd64 + arm64. Distributed via npm (the package wraps
  the native binary), and release archives;
  no Node runtime needed to run it.
- **Agent core**: the loop, built-in tools (read/write/edit/multi_edit/glob/grep/
  ls/bash/web_fetch/todo_write), permission gate, sandboxed bash, and the
  DeepSeek prefix-cache–oriented design.
- **Subagents**: `task` plus explore/research/review/security_review skill agents.
- **Skills & hooks**: Claude-Code-style skills (`internal/skill`) and hooks
  (`internal/hook`), symlink-aware and slash-integrated.
- **MCP client**: connect external servers over stdio / Streamable HTTP; reads
  `[[plugins]]` and a Claude-Code `.mcp.json`.
- **Code intelligence via CodeGraph**: a tree-sitter symbol/call graph
  (`codegraph_*` tools) replaces embedding semantic search — no embedding service
  or API cost. Fetched into a local cache on first use (or `voltui codegraph
  install`) and indexed in the background, so installs and startup stay fast.
- **Plan mode** with evidence-backed step sign-off (`complete_step`).
- **Memory**: `VOLTUI.md` hierarchy + auto-memory, folded into the cache-stable
  prefix.
- **ACP** (`voltui acp`) and an HTTP/SSE server frontend; desktop app (Wails).

### Fixed

- **File encoding support restored** — GBK/GB18030 (and other non-UTF-8) files
  can now be read, edited, and grepped correctly. The v2 rewrite had dropped
  v1's encoding detection; files in CJK Windows charsets were silently misread
  or rejected as binary. The read/edit/write round-trip now preserves the
  original file encoding. (#2637)

### Notes

- Versions: the legacy TypeScript line stays in `0.x`; the Go line starts at
  `1.0.0`. See [docs/MIGRATING.md](docs/MIGRATING.md).
- Release archives ship a bare binary; CodeGraph is fetched on first use. Windows
  support for the fetched runtime is unverified — install `codegraph` on PATH if
  the auto-fetch doesn't resolve there.

[1.0.0]: https://github.com/esengine/DeepSeek-Reasonix/releases/tag/v1.0.0