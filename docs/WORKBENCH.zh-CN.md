# 工作台

桌面工作台是运行在受控 Electron 窗口中的本地 Svelte 5 界面，使用 shadcn-svelte 构建工作控件，并使用 svadmin 承载资源化管理视图。

Electron 启动官方 Web Profile 并等待可信的 `dsh web:` loopback URL，再通过隔离 preload 暴露严格白名单的 RPC/事件桥接。界面不镜像 DSH 持久化，也不实现第二套 Agent 引擎，会话、工具、审批和凭据仍由官方运行时负责。

`profiles/anyong.yml` 只包含产品默认值。缺失的运行时能力应通过官方 DSH 的 profile/plugin 配置或上游贡献完成，不在本仓库恢复私有引擎代码。

## 对话生成操作界面

Volt 支持通过对话生成受控的 svadmin 操作界面。模型不生成或执行 Svelte、HTML、CSS、JavaScript、SQL、URL 或事件处理器，而是返回版本化的 `@svadmin/surface` JSON proposal。Volt 使用固定组件 catalog 和资源 policy 校验 proposal，先显示预览，只有用户确认后才交给 Svelte `SurfaceRenderer` 渲染。

这与 DSH Generative UI 插件的声明式架构一致，但渲染层保持为 Volt 自己的 Svelte 5 + svadmin，不加载第三方 React renderer，也不新增会话、权限、凭据、工作区或持久化后端。
