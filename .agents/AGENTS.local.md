# Volt GUI Project Overlay

本仓库是 Go CLI/TUI + Wails desktop + Astro docs 的混合项目。执行任务时优先保持现有技术栈和目录边界，不引入新的前端或桌面框架。

## Stack Profile

- Root module: Go CLI/TUI, `go.mod`, entrypoints in `cmd/`, reusable code in `internal/`.
- Desktop module: Wails v2 nested module in `desktop/`, with independent `desktop/go.mod` and `desktop/frontend/`.
- Site: Astro documentation site in `site/`, using npm and Node 22 in CI.
- Release: GitHub Actions currently targets `main-v2`; CNB 镜像仓库同步时不要改动该分支策略，除非任务明确要求。

## Required Skills

- 默认先读 `references/skills/INDEX.md`。
- Go/CLI/TUI 任务按仓库现有 Go 代码规范执行：`gofmt`、`go vet`、`go test` 是基础门禁。
- Desktop/Wails 任务需要同时关注 `desktop/go.mod`、嵌入的 `desktop/frontend/dist`、平台差异和 CGO/WebKit 依赖。
- Site/Astro 任务需要加载 `typescript`；如涉及部署，再加载 `deployment-target-selector`。
- 涉及 agent-team 自动化、Task Ledger、mailbox、provider adapter 时加载 `agent-team-automation` 和 `provider-adapter`。

## Verification Profile

按改动范围选择最小但真实的验证命令：

- Root Go: `gofmt -w <changed-go-files>`，`go vet ./...`，`go test ./...`
- Desktop Go: `cd desktop && go test ./...`
- Desktop module hygiene: `cd desktop && go mod tidy && git diff --quiet -- go.mod go.sum`
- Site: `cd site && npm ci && npm run build`
- Agent-team config: `agent-team automation smoke .`，`agent-team automation diff-check`

跨模块修改完成前必须运行 `git diff --check`。

## Non-goals By Default

- 不默认迁移 Wails、Astro、Go module 结构或 CI 分支策略。
- 不把本地 secrets、用户配置、`.agents/state/` 运行态、mailbox 消息文件提交进仓库。
- 不把桌面平台专属依赖强加到 CLI 构建路径。
