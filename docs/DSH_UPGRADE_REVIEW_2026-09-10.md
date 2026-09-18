# DSH 与插件升级审查

日期：2026-09-10。环境：Windows x64、Node 26.8.1、pnpm 12.1.0。

## 结论

仓库已迁移到当日 npm registry 的非 Alpha 最新版本，并保持官方 DSH 为会话、工具、权限、凭据、工作区和持久化的唯一权威。没有读取或修改真实用户 `DSH_HOME`，没有使用真实凭据或调用付费模型，也没有提交、推送、发布或部署。

| 组件 | 升级前基线 | 当前精确版本 | 状态 |
| --- | --- | --- | --- |
| 官方 DSH | `0.1.1-rc.2` | `0.1.5-rc.1` | 已迁移 Remote/Cookie 协议并通过真实进程集成 |
| BrowserSkill DSH plugin | `0.1.2` | `0.2.1` | 已升级，保留 Profile 自定义配置和旧包备份 |
| BrowserSkill CLI | `0.1.11` | `0.2.1` | 已核对官方 Release 资产及 Windows 二进制 SHA-256 |
| OfficeCLI | `1.0.146` | `1.0.149` | 已核对 npm 完整性、Windows 资产 SHA-256 和 MCP 激活 |
| `ws` | `8.20.0` | `8.21.3` | Electron Remote 流客户端精确锁定 |

Registry 在本次实施过程中从先前审计的 DSH `0.1.2-rc.1` 更新到 `0.1.5-rc.1`；最终版本以 2026-09-10 的 `latest`/`next` 为准，未选择 `0.1.5-alpha.2`。所有锁定的官方 DSH 包统一为 `0.1.5-rc.1`，新增的会话格式 `v0 -> v1 -> v2 -> v3` 迁移包也纳入供应链门禁。

## 协议迁移

- 启动器只接受带唯一 43 字符 token 的 IPv4 loopback URL，主进程通过根地址 303 交换 HttpOnly Cookie；token、Cookie 不进入 renderer，启动诊断统一脱敏。
- HTTP RPC 改为 Typert Remote 的 `namespace/method` 与严格命名参数；响应校验 `server-response`、`rpcId` 和业务结果。
- WebSocket 统一使用认证后的 `/api/remote.mux`，支持 `$events`、`session/follow`、`session/control` 和 `workspace/follow`。
- 审批与提问按 `$events` 的 `clientId/eventId` 关联；连接代际变化会清理旧请求，取消与结果只影响匹配项。
- `session/follow` 请求启用 `assistantStream`，可恢复正在生成的压缩文本/推理基线，并转发后续流帧；断线自动重连，新的历史请求会明确取消旧请求而不会留下永久 pending IPC。

## 升级后迁移

隔离迁移测试从完整的 DSH `0.1.1-rc.2` + BrowserSkill `0.1.2` 临时部署创建旧会话，然后直接以当前 `0.1.5-rc.1` 连续启动两次。测试逐项验证：

1. 旧会话仍可发现，session id、标题和标题投影保持一致。
2. 迁移前四个 durable events 在迁移后保持原顺序和内容；新版允许追加自己的格式迁移事件。
3. 合成凭据仍为 configured，已有凭据条目未被覆盖。
4. settings 文件、Profile 自定义字段、额外 dependencies/bundles 和用户 `cordis.patch.yml` 保持不变。
5. BrowserSkill 从 `0.1.2` 升级到 `0.2.1`；另有独立测试覆盖 `0.2.0 -> 0.2.1`。
6. 插件迁移的排他锁、原子 manifest、备份、回滚、异常中断恢复、第二进程竞争和未知版本拒绝均有故障注入测试。

这些测试不触碰真实用户目录。正式升级前仍应关闭使用同一 Profile 的所有暗涌/DSH 进程并备份整个 `DSH_HOME`；人工恢复步骤见 `docs/DSH_PLUGIN_COMPATIBILITY.md`。

## 已修复问题

- 任意本地页面继承 preload/IPC：导航与 IPC sender 已绑定精确前端入口、当前窗口和顶层 frame。
- Windows CI 吞掉前序原生命令失败：GitHub/CNB 多命令步骤逐条检查 `$LASTEXITCODE`，桌面触发路径覆盖真实打包输入。
- DSH 运行时并发重启：整个 stop/start 事务使用 single-flight，旧退出回调不能清空新 child 所有权。
- 启动超时泄露 token：完整行和未换行缓冲区均统一脱敏。
- 已取消流仍创建 WebSocket：预取消在建连前返回，握手和读取均由同一 `finally` 清理。
- 会话切换丢审批/提问：待处理项和答案按 session 隔离，resolved 只清理匹配 `rpcId`。
- 历史晚返回覆盖实时消息：历史加载期间缓冲同会话事件，快照折叠后再按序合并。
- 切换会话后模型请求回写错误会话、模型 ID 中 `/` 被截断、设置更新跳过模型目录刷新：均已修正并覆盖单元测试。
- 运行中 DSH 退出后无重试入口：renderer 会释放失效 client 并显示恢复入口。
- 普通网页链接无响应：新窗口仍不在 Electron 内打开，但经过校验的无凭据 HTTP(S) URL 会交给系统浏览器。

## 残余风险

- GitHub Pages 工作流目前只运行站点 build，没有执行 `site` 的功能 smoke；构建成功仍可能遗漏关键页面内容。
- CNB 发布脚本仍把允许的 `-rc.N` 标签固定发布为 `prerelease: false` 且 `make_latest: true`；候选版本可能被标成正式最新版。
- BrowserSkill 浏览器扩展和真实登录态没有在本轮自动升级或操作；真实浏览器联调需要人工环境。
- 未执行真实模型、复杂附件/长对话、NSIS 安装覆盖、签名、自动更新和生产发布验收。

## 验证门禁

核心门禁包括：冻结安装、Electron 类型检查与运行时测试、前端检查与单元测试、DSH 集成、旧数据直升、源码构建、Electron/迁移/工作流边界、站点测试、技能同步与 `git diff --check`。最终结果以本次任务结束前的实际运行记录为准。
