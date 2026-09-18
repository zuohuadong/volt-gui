# 桌面启动与凭据修复记录

日期：2026-09-11

## 任务约定与交付状态

- 目标：排查客户安装 release 后的 DSH 启动超时与模型 401，修复可复现缺陷并补充发布门禁。
- 非目标：恢复旧运行时、重建凭据存储、覆盖用户在设置中保存的密钥、自动提交或发布。
- 执行：medium / managed；当前任务为唯一修改者，另设一个只读验证角色。
- 验收：来源组合回归、真实 DSH 与本地模拟网关、类型检查、构建、安装包 smoke、最终 diff 检查。
- 状态：**代码与评审安装包已完成**。客户电脑的实际安装复测仍属于外部验收，不在本机自动执行。

## 已确认并修复

1. **环境文件阻止内置凭据导入。** 官方 DSH 对 `project-env`、`user-env` 也返回 `configured: true`。旧判断会跳过内置凭据，让旧环境文件继续生效。现在仅对这两种回退来源导入，通过官方 `credentials.set` 写入；保留 `file` 和未知来源，对不可覆盖的进程环境显式报错。
2. **安装包网关地址未生效。** sidecar 的地址现在经校验后传给官方 profile，拒绝含内嵌认证、查询参数或片段的地址。
3. **YAML 注释混入密钥。** 构建变量改为结构化 YAML 解析；解析错误不输出原始内容。移除 CNB 中重复的正则解析，避免其环境变量优先级绕过修复。
4. **启动与 smoke 标准不一致。** 桌面单次启动从 30 秒调整到有界的 180 秒，保留一次自动重试。smoke 直接复用桌面运行时类、凭据导入与环境隔离；要求内置凭据的发布模式不允许缺少导入。
5. **进程清理与失败传播。** 旧进程的延迟 close 不再清空新进程的引用，Windows 停止失败时拒绝重叠启动；超时诊断包含尚未换行的输出。CNB 原生命令失败后立即停止后续阶段。

## 验证证据

最终针对性测试：**45 项通过，0 失败**，覆盖：

- 两种 `.env` 来源由真实官方 DSH 读取；本地模拟网关先拒绝旧假密钥，导入后接受新假密钥。
- 验证实际 DSH 设置中的网关地址；重启后仍可认证，原 `.env` 不变。
- 保留用户托管凭据、进程环境覆盖报错、未知来源不覆盖。
- YAML 引号、行尾注释、无效格式与错误信息脱敏。
- 超时诊断、重试、Windows 子进程树清理、CNB 发布失败门禁。

真实集成使用独立暂存的官方 `0.1.1-rc.2` 依赖图，通过 `ANYONG_TEST_PACKAGE_ROOT` 指定。测试仅使用合成凭据与本机网关，不调用真实付费模型。

```powershell
$env:ANYONG_TEST_PACKAGE_ROOT = "$PWD/apps/desktop-electron/.dsh-runtime"
node --test apps/desktop-electron/src/official-dsh-runtime.test.ts scripts/desktop-credentials.integration.test.mjs scripts/ci-workflows.test.mjs scripts/stage-bundled-model-credentials.test.mjs scripts/smoke-packaged-dsh-runtime.test.mjs
```

最终 Electron 类型检查、主进程构建、完整 `pnpm test` 和 `pnpm run build` 均通过。

升级完成后重新暂存并验证了官方 DSH `0.1.5-rc.1`、BrowserSkill `0.2.1` 和 OfficeCLI `1.0.149`。真实升级回归 8 项、DSH 集成 9 项均通过。

Windows x64 评审产物已生成并通过检查：`dist/anyong-windows-x64-installer-0.31.42.exe`、`dist/anyong-windows-x64-portable-0.31.42.zip`；安装器为 `NotSigned`，便携包包含 `Anyong.exe`，全部 ZIP 条目可读取，packaged smoke 和 bundled sidecar 检查通过。

## 未完成的验收

- 客户机器的实际安装、首次启动和真实网关请求尚未远程复测；本机没有自动启动真实推理，以避免无授权消耗客户网关额度。
- 本轮公开 CNB latest / release-list 查询返回 HTTP 401，无法确认客户下载的最新 tag、发布日期或资产。没有提交、推送或发布新 release。
- 客户截图中的启动超时尚未取得客户启动日志，不能把等待上限差异直接认定为客户根因。若用户已保存的托管密钥本身失效，需要更新真实凭据，代码不会擅自替换。

## 继续条件

发布前仍需取得发布授权，并让客户安装 `dist` 中的新评审包复测首次启动与真实网关认证。若用户已保存的托管密钥本身失效，需要更新真实凭据，代码不会擅自替换。
