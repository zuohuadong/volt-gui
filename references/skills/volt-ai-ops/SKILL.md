---
name: volt-ai-ops
description: Use when tasks involve 西谷AI (volt AI) internal operations, 西谷智灯暗涌系统 product strategy, Chinese AI market context, local regulations, or fork-specific workflow decisions. Covers release workflow, internal tooling, and product-market-fit decisions for the 西谷智灯暗涌系统 coding agent.
---

# 西谷AI / 西谷智灯暗涌系统运营技能

此技能覆盖西谷AI (volt AI) 的内部运营决策、西谷智灯暗涌系统产品策略和中国AI市场背景。

## 产品定位

西谷智灯暗涌系统是 VoltUI 的中国本土化 fork，定位为：

- **目标用户**: 中国开发者团队和企业内网部署
- **核心差异**: 本土化品牌、CNB 云构建支持、中文交互优先、合规适配
- **技术栈**: 与上游 VoltUI 完全一致（Go CLI/TUI + Electron/DSH/Svelte 5 Desktop），仅通过 BrandConfig 与 Electron 品牌环境变量定制品牌

## Fork 筡理策略

### 核心原则：配置优先，外部变更显式评审

| 改动类型 | 是否允许 | 实现方式 |
|---|---|---|
| 品牌定制 | ✅ | `VOLTUI_BRAND_NAME` 环境变量 + `[brand]` 配置段 |
| CI/CD 配置 | ✅ | `.cnb.yml` (CNB CI 管道) |
| 自动上游同步 | ❌ | 同步脚本与定时合并链已永久退役 |
| 源码硬编码品牌替换 | ❌ | 违反 BrandConfig 设计，破坏上游同步 |
| 新功能代码 | ⚠️ | 先贡献上游 PR，再在 fork 中享受 |

### 外部变更引入流程

1. **禁止自动同步**: CNB CI 不定时 fetch、merge 或创建 upstream sync PR
2. **显式评审**: 需要引入的外部改动必须形成独立 PR，逐项说明来源与适配范围
3. **验证**: 合并前运行 Go 门禁、Electron 边界测试、Svelte 检查与 `pnpm run build:desktop`

### 向上游贡献流程

1. 在 fork 中发现有价值的功能改进
2. 基于 `upstream/main` 创建干净分支（不含品牌定制）
3. 推送到 `upstream` 仓库，创建 PR
4. 上游合并后，仅在确有需要时通过新的显式 PR 引入，不恢复同步链

## 发布流程

### 桌面端发布（当前仅 Windows x64）

```
feat: 新功能 → CNB build-only 验证 → GitHub Windows runner → 未签名 Electron artifact
```

1. 开发者推送 `feat:` 提交到 `main`
2. CNB CI 检测约定式提交，计算候选版本并验证 Electron 源码 bundle
3. 受保护的 GitHub 工作流解析不可变候选 SHA
4. `windows-latest` 生成 NSIS 与 portable x64 产物
5. 在生产签名与 updater 契约迁移完成前，仅上传短期未签名 artifact，不发布公开 GitHub Desktop Release

### 品牌名在产物中的体现

- 环境变量 `VOLTUI_BRAND_NAME=西谷智灯暗涌系统` → Electron 运行时显示本土化品牌
- `VOLTUI_BRAND_SHORT_NAME=暗涌` → 紧凑界面使用短品牌名
- 正式安装包元数据仍需在 Electron builder/signing 迁移任务中完成配置闭环

## 中国AI市场背景

### 合规要点

- 内容安全: 系统提示词需遵守中国 AI 内容安全规范
- 数据本地化: 企业客户可能要求数据不出境
- 开源合规: VoltUI 使用 MIT + Apache 2.0 双许可

### 竞争格局

| 产品 | 框架 | 定位 |
|---|---|---|
| 西谷智灯暗涌系统 (VoltUI fork) | Go + Electron/DSH/Svelte 5 | 本土化编码 Agent |
| Cursor | Electron | 国际化 AI 编码 IDE |
| CodeBuddy | 云 IDE | 中国 AI 编码助手 |
| Claude Code | CLI | Anthropic 编码 Agent |

### 差异化优势

1. **双运行时边界**: Go CLI/TUI 保持轻量，Electron/DSH 提供成熟桌面能力
2. **本地运行**: 无需云端，企业内网友好
3. **多模型**: 支持 DeepSeek/OpenAI/本地模型切换
4. **MCP 协议**: 内置 MCP 服务器支持（time, Context7, filesystem 等）

## 内部工具链

| 工具 | 用途 | 位置 |
|---|---|---|
| `.agents/` | Agent team 配置、角色、工作流 | 项目根目录 |
| `references/skills/` | 技能知识库（含上游 + 西谷智灯暗涌系统专属） | 项目根目录 |
| `.cnb.yml` | CNB CI/CD 管道配置 | 项目根目录 |

## Decision Protocol

遇到涉及产品方向的决策时：

1. **功能改动**: 先评估是否应该贡献上游 → 如果通用，提 PR 到 volt-gui
2. **本土化定制**: 评估是否可以通过 BrandConfig 实现 → 如果可以，不改源码
3. **市场决策**: 参考 `暗涌.md` 产品策略文档

## Directive

西谷智灯暗涌系统 fork 的所有改动必须遵循「配置优先」原则：
- 品牌定制 → BrandConfig 环境变量/配置段
- CI 定制 → `.cnb.yml`
- 功能改动 → 先评估是否应贡献外部项目，再通过显式 PR 引入
- 不启用自动 upstream sync，不以定时 merge 维持源码一致
