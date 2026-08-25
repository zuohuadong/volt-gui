# 工作台

桌面工作台是运行在受控 Electron 窗口中的官方 DSH Web UI。

Electron 启动 Web Profile 并等待可信的 `dsh web:` loopback URL。它不再渲染第二套本地 UI、不代理会话 API，也不镜像 DSH 持久化，从而让会话、工具、审批和凭据行为保持与官方运行时一致。

`profiles/anyong.yml` 只包含产品默认值。新增能力应通过官方 DSH 的 profile/plugin 配置或上游贡献完成，不在本仓库恢复私有引擎代码。
