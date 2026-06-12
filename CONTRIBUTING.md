# Contributing to 暗涌 (VoltUI fork)

感谢你对暗涌项目的关注！本指南涵盖如何为暗涌 fork 贡献代码。

## Fork 贡献原则

暗涌是 [VoltUI](https://cnb.cool/aizhuliren/volt-gui) 的 fork，遵循以下贡献原则：

1. **通用功能先提 PR 到上游** — 然后在 fork 中享受
2. **fork 专属改动仅限配置文件** — `.cnb.yml`、skill 文件、产品文档
3. **禁止硬编码品牌名到源码** — 使用 `[brand]` 配置段 + `VOLTUI_BRAND_NAME` 环境变量
4. **行业 skill 不贡献上游** — `anyong-brand-config`、`cnb-ci-cd`、`xigu-ai-ops`

## Prerequisites

- **Go 1.26+** — the project targets the latest stable Go release
- **Git** — for version control
- **Node.js** (optional) — only if you work on the desktop app (`desktop/`)

## Getting started

```bash
git clone https://cnb.cool/aizhuliren/xgic/anyong-agent.git
cd anyong-agent
go build ./cmd/voltui    # builds the CLI binary
go test ./...              # runs the full test suite
```

## Project structure

| Directory | Purpose |
|-----------|---------|
| `cmd/voltui` | CLI entry point |
| `internal/agent` | Agent loop, session, coordinator |
| `internal/cli` | TUI, subcommands, setup wizard |
| `internal/control` | Transport-agnostic controller |
| `internal/config` | TOML configuration loading |
| `internal/tool/builtin` | Built-in tools (bash, read_file, …) |
| `internal/provider` | Model-backend abstraction |
| `internal/provider/openai` | OpenAI-compatible provider |
| `internal/plugin` | MCP client (stdio + HTTP) |
| `internal/event` | Typed event stream |
| `internal/hook` | Shell hooks (PreToolUse, …) |
| `internal/memory` | VOLTUI.md hierarchy + auto-memory |
| `internal/skill` | Skill discovery from Markdown |
| `internal/sandbox` | OS-level sandboxing |
| `internal/serve` | HTTP/SSE server frontend |
| `internal/checkpoint` | Snapshot-based rewind |
| `desktop/` | Wails-based desktop app (separate Go module) |
| `docs/` | Engineering spec, migration guide |
| `references/skills/` | Fork 专属行业 skill (不贡献上游) |

### Dependency direction

```
cli → {agent, plugin, config} → {tool, provider}
```

Built-in subpackages import their parent to self-register via `init()`.
Parents never import children.

## Development workflow

### Building

```bash
make build          # go build ./...
make test           # go test ./...
make vet            # go vet ./...
make fmt            # gofmt -w .
make hooks          # install git hooks (pre-push: go vet)
make cross          # cross-compile for all 6 targets
```

### Running tests

```bash
go test ./...                           # all tests
go test ./internal/agent/ -v            # verbose, one package
go test ./internal/tool/builtin/ -run TestGrep  # one test
```

### Code style

- `gofmt` is enforced by CI — format before committing
- Follow existing patterns: wrap errors with `fmt.Errorf("...: %w", err)`
- Library code never calls `os.Exit` or prints to stdout/stderr
- Only `cli/` and `main/` decide exit codes and user-facing messages
- Exported identifiers must have doc comments

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(glob): add ** recursive pattern support
fix: replace silent error discards with structured logging
test(event): add comprehensive unit tests for event package
docs: add CONTRIBUTING.md
ci: add golangci-lint and govulncheck
```

## 贡献类型

### 向上游贡献 (通用功能)

如果你要添加的是**所有 VoltUI 用户都能受益**的功能：

1. 在 [volt-gui](https://cnb.cool/aizhuliren/volt-gui) 上提交 Issue / PR
2. 上游合并后，暗涌通过 `git merge upstream/main` 自动获得

### 向暗涌 fork 贡献 (本土化/行业专属)

如果你要添加的是**只有暗涌用户需要**的功能：

1. Fork 本仓库
2. 创建 feature branch from `main`
3. Make your changes with tests
4. 确保 `go test ./...` 通过
5. 确保 `gofmt -l .` 无输出
6. 在 CNB 上提交 Pull Request 到 `main`

> **注意**: fork 专属改动只允许修改 `.cnb.yml`、skill 文件和产品文档，
> 不允许修改 `internal/` 下的源码（除非同步上游后的必要适配）。

## Adding a new built-in tool

1. Create `internal/tool/builtin/mytool.go`
2. Implement the `tool.Tool` interface: `Name()`, `Description()`, `Schema()`, `ReadOnly()`, `Execute()`
3. Register via `func init() { tool.RegisterBuiltin(myTool{}) }`
4. Add tests in `internal/tool/builtin/builtin_test.go` or a separate `mytool_test.go`
5. The tool is automatically available — `main` blank-imports `builtin`

## Adding a new model provider

(For MCP tool servers see `internal/plugin` instead — that's a different layer.)

1. Create `internal/provider/myprovider/`
2. Implement `provider.Provider`: `Name()`, `Stream()`
3. Register via `func init() { provider.Register("mykind", New) }`
4. The provider is available from config with `kind = "mykind"`

## Adding i18n strings

1. Add the field to `internal/i18n/i18n.go` (`Messages` struct)
2. Add the value in `internal/i18n/messages_en.go` and `messages_zh.go`
3. The `TestCatalogsComplete` test will fail if you miss a locale

## Reporting issues

在 CNB 上 Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- Go version and OS
- Relevant logs or error messages

## License

By contributing, you agree that your contributions will be licensed under the
same license as the project (MIT).