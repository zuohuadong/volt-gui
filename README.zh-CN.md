# VoltUI

VoltUI 是围绕官方 DeepSeek Harness（DSH）Web Profile 的本地 Electron 桌面 Shell。

## 运行时契约

- Node.js `26.7.0`（Node 26 支持直接执行可擦除类型的 `.ts` 脚本）。
- pnpm `11.23.0`，使用冻结 lockfile。
- Electron `44.0.0` 与 electron-builder `26.15.3`。
- 官方 `@deepseek-ai/dsh@0.1.1-rc.2`，根包和 Electron 包均精确锁定。
- 已验证打包目标为 Windows x64。签名和更新器契约审批完成前，发布物只作为 unsigned-review 制品。

Electron 负责窗口、导航策略、进程生命周期和制品身份；官方 DSH 负责会话、工具、权限、凭据、工作区状态和存储。仓库不再维护第二套 Agent 引擎。

## 快速开始

```sh
corepack enable
corepack prepare pnpm@11.23.0 --activate
pnpm install --frozen-lockfile
pnpm run desktop
```

使用 `DSH_WORKSPACE` 指定初始工作区，使用 `DSH_HOME` 指定 DSH 状态目录。模型凭据留在 DSH 的 profile/settings 边界内，禁止提交到仓库。

## 验证

```sh
pnpm test
pnpm run test:dsh-integration
pnpm run build
pnpm run dist:desktop
cd site && npm ci && npm test
```

迁移门禁会拒绝被跟踪的旧模块、退役原生包目录、仓库内旧 Harness 引擎、历史同步引用，以及活跃代码、CI、脚本和站点中的旧 renderer 路径。

## 目录

- `apps/desktop-electron/`：Electron 主进程、官方 DSH 子进程生命周期和 Windows 打包。
- `profiles/`：应用到官方 DSH bundle 的有序 profile overlay。
- `scripts/`：启动器、集成测试、运行时边界、迁移门禁和打包辅助脚本。
- `site/`：当前运行时契约的 Astro 文档站点。

## 许可

MIT。见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。
