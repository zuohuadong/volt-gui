---
name: volt-ops
description: Use for Volt product strategy, Volt distribution scope, Chinese enterprise constraints, and decisions about official DeepSeek Harness integration.
---

# Volt 运营约束

## 当前产品架构

- 官方 `@deepseek-ai/dsh` 是唯一 Harness 与产品 UI。
- Electron 仅拥有窗口、安全、导航与 DSH 子进程生命周期。
- `profiles/anyong.yml` 仅覆盖官方 profile 已提供的配置行。
- CNB 验证 Node 源码；GitHub 仅打包 Windows x64 未签名评审产物。

## 决策规则

1. 产品能力优先使用官方 DSH profile/plugin 扩展点。
2. 缺少扩展点时，形成明确的 DSH 依赖需求，不在本仓库复制实现。
3. 外部源码与其他项目不自动同步；版本升级使用 npm 精确版本和独立 PR。
4. 不恢复仓库内 Harness、renderer、服务 Worker 或旧发布通道。
5. 企业凭据和模型配置由 DSH 管理，本仓库不建立第二套存储。

## 发布规则

- 只宣称实际验证的平台与产物。
- 未签名产物只用于评审，不宣称正式发布。
- 签名、updater、macOS、Linux 或生产部署需要单独合同和证据。
- 不输出或持久化任何真实密钥。

## 产品方向

暗涌面向中文优先、企业内网和本地工作区场景。差异化应来自配置、
企业集成和受支持的 DSH 插件，而不是维护一套分叉的 Agent 内核或 UI。
