# Volt GUI Project Overlay

本仓库的产品运行时是 Node 26 + Electron + 官方 DeepSeek Harness。官方 DSH 是唯一 Harness，并拥有会话、工具、权限、凭据和工作区；桌面只保留薄 Svelte workbench 与隔离 preload，不维护第二套持久化实现。

## Stack Profile

- Root workspace: 官方 `@deepseek-ai/dsh`、Node 26 launcher、distribution bundle 与共享 profile patch。
- Desktop: `apps/desktop-electron/` owns the window, security boundary, navigation, and official DSH child lifecycle. `apps/desktop-frontend/` is a thin Svelte workbench over official DSH, not a second session/tool/credential/persistence stack. Preload stays an isolated IPC allowlist.
- Site: Astro documentation site in `site/`, using npm and Node 26 in CI.
- Release: CNB `.cnb.yml` validates source on `main`; GitHub packages Windows x64 Electron unsigned-review artifacts with `pnpm run dist:desktop`. OEM bundled credentials come from GitHub Actions secrets, never from tracked files. Public signed release, updater, macOS and Linux remain fail closed.

## Required Skills

- 默认先读 `references/private-skills/INDEX.md`，判断是否存在 VOLT 私有行业 skill；若任务不属于私有技能覆盖范围，再读 `references/skills/INDEX.md`。
- 项目私有技能安装在 `.voltui/skills/`，VoltUI 可直接发现；`references/private-skills/skills-manifest.json` 是全量清单。
- 桌面 UI 只做薄 Svelte workbench；会话、工具、权限、凭据和工作区仍由官方 DSH 拥有，不在仓库里再做第二套 Harness 或持久化。
- Desktop/Electron 任务需要关注 `apps/desktop-electron/`、`apps/desktop-frontend/`、根 `pnpm-lock.yaml`、loopback 导航、浏览器权限和原生依赖打包。
- Site/Astro 任务需要加载 `typescript`；如涉及部署，再加载 `deployment-target-selector`。
- 涉及 agent-team 自动化、Task Ledger、mailbox、provider adapter 时加载 `agent-team-automation` 和 `provider-adapter`。
- **暗涌品牌相关**：加载 `anyong-brand-config` — 使用 Electron profile 和 DSH patch，不重建旧品牌配置层。
- **CNB CI/CD 相关**：加载 `cnb-ci-cd` — 本仓库 `.cnb.yml` 只做 Node 26 源码门禁，不导入密钥、不发布安装包。
- **Volt 内部决策**：加载 `volt-ops` — 涉及产品策略、上游同步、中国市场背景。
- **对照 CNB anyong-agent**：加载 `xigu-ai-ops` — 仅用于学习/移植那条更快的产品线，不把 CNB 发版合同复制进本仓库。
- 半导体 ATE、测试程序、良率/SPC、失效分析、LIMS/OCR 数据组织等行业任务，优先加载 `.voltui/skills/semiconductor-*` 和相关工程/数据技能。

## Computation & Tool Execution Policy

- **数学计算强制工具化**：凡涉及数值运算、公式求解、统计汇总、良率/SPC 计算、Cpk/Ppk 推导、浮点精度换算、单位转换等数学计算，严禁使用纯文本心算、估算或口算。
- **工具内置且默认开启**：必须使用运行时内置且默认开启的确定性执行工具（DSH 内置 `tool-pwsh` / `tool-bash` 驱动的 Node.js 26、Python 或 PowerShell 脚本引擎）进行真实计算。
- **计算过程与证据可溯**：所有计算结论必须基于工具执行返回的真实数据输出，杜绝任何模型数值幻觉与口算偏差。

## Verification Profile

按改动范围选择最小但真实的验证命令：

- Core: `pnpm test`，`pnpm run test:dsh-integration`，`pnpm run build`
- Desktop: `pnpm run build:desktop`
- Electron boundary: `node --test scripts/check-electron-runtime-boundary.test.mjs`，`node scripts/check-electron-runtime-boundary.mjs`
- Site: `cd site && npm ci && npm test`
- Migration: `node scripts/check-migration-boundary.mjs`
- Workflows: `node --test scripts/ci-workflows.test.mjs`
- Agent-team config: `agent-team automation smoke .`，`agent-team automation diff-check`
- Skills sync: `node scripts/check-skills-sync.mjs`

跨模块修改完成前必须运行 `git diff --check`。

## Non-goals By Default

- 不恢复已删除的旧运行时、本地 Harness、renderer/preload、Worker 服务、发布链或自动外部同步。
- 不在 Electron 中复制 DSH 已经提供的会话、工具、权限、凭据、工作区或持久化能力。
- 不把本地 secrets、用户配置、`.agents/state/` 运行态、mailbox 消息文件提交进仓库。
- 不把桌面平台专属依赖强加到 CLI distribution 构建路径。
