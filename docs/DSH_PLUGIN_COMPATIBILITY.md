# Volt DSH Plugin Compatibility

审计日期：2026-08-30

## 官方运行时

`@deepseek-ai/dsh` 的 npm `latest` 与 `next` 当前均为 `0.1.1-rc.2`。2026-08-30 出现了 `0.1.2-alpha.2` 预发布版本，但它不在稳定 dist-tag，且当前 registry 的 tarball 请求返回 404；Volt 不把 Alpha 当作可复现的稳定升级。Volt 已精确锁定 `0.1.1-rc.2`，升级必须同时通过 DSH 集成、Electron 边界和打包运行时验证。

## 第三方插件审计

| 包 | 版本 | 结论 | 原因 |
| --- | --- | --- | --- |
| `dsh-workbench` | `0.11.0` | 暂不引入 | MIT，但包含 React client、独立文件 host API 和自己的 workspace/watch/history 状态；会和 Volt 的 Svelte 工作台及官方 DSH 工作区能力重复。 |
| `dsh-better-sidebar` | `0.17.1` | 暂不引入 | MIT，但包含 React renderer、`node-pty`、文件/Git/浏览器/任务服务和独立设置持久化；超出 Volt 的单一官方 DSH 运行时边界。 |
| `dsh-ide-sidebar` | `0.1.1` | 暂不引入 | 仅 React Web sidebar 注入，不能挂载到 Volt 的本地 Svelte renderer。 |
| `dsh-conversation-navigator` | `0.2.1` | 暂不引入 | 仅官方 Web conversation 注入，Volt 已在本地 renderer 管理会话导航。 |
| `@tecfancy/dsh-dock-terminal` | `0.5.3` | 暂不引入 | 带 `node-pty` 和 React client；会建立第二个终端呈现/权限面。 |
| `dsh-localqwen-rolefix` | `1.0.3` | 观察名单 | Host-only Profile Bundle，MIT；依赖 pi-ai 内部 model descriptor，需针对 Volt 的本地 provider 做真实回归后才能启用。 |

## 采用原则

Volt 只接受以下插件：

1. 通过官方 `dsh plugin --profile <profile> add` 安装的 Profile Bundle。
2. 不携带第二套 renderer、会话、工作区、凭据、权限或持久化实现。
3. 不要求 Electron 直接访问文件系统或 Git；原生能力必须经过现有安全边界。
4. 精确锁版本、记录许可证和完整性信息，并在分发 bundle 中可复现。

因此本轮没有盲目安装第三方插件。现有 Volt 功能已经覆盖文件引用、文件浏览、会话/检查点、插件清单、SMB 和界面自定义；引入上述 Web 工作台会造成重复实现而不是补齐能力。

DSH 的社区 Generative UI 实践证明了 DSH 可以让模型生成交互界面。Volt 采用相同的“模型产出声明式界面规格”思路，但保持 Svelte/svadmin 技术栈：模型只生成 `@svadmin/surface` JSON proposal，Volt 按 catalog 和 policy 校验，用户确认后再由 `SurfaceRenderer` 渲染。任何原始 HTML、CSS、JavaScript、Svelte、SQL、URL 或 mutation 都会被拒绝。

## 后续引入门槛

若要启用观察名单插件，先在隔离 profile 中执行：

```bash
dsh plugin --profile web add dsh-localqwen-rolefix@1.0.3
```

然后使用 Volt 的真实 provider、`pnpm run test:dsh-integration` 和打包 smoke 验证；任何兼容性失败都应移除插件，而不是在 Volt 内复制其实现。
