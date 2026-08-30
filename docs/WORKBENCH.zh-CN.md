# 工作台

桌面工作台是运行在受控 Electron 窗口中的本地 Svelte 5 界面，使用 shadcn-svelte 构建工作控件，并使用 svadmin 承载资源化管理视图。

Electron 启动官方 Web Profile 并等待可信的 `dsh web:` loopback URL，再通过隔离 preload 暴露严格白名单的 RPC/事件桥接。界面不镜像 DSH 持久化，也不实现第二套 Agent 引擎，会话、工具、审批和凭据仍由官方运行时负责。

`profiles/anyong.yml` 只包含产品默认值。缺失的运行时能力应通过官方 DSH 的 profile/plugin 配置或上游贡献完成，不在本仓库恢复私有引擎代码。
