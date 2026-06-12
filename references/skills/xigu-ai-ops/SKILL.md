---
name: xigu-ai-ops
description: Use when tasks involve 西谷AI (Xigu AI) internal operations, 西谷智灯暗涌系统 product strategy, Chinese AI market context, local regulations, or fork-specific workflow decisions. Covers upstream sync strategy, release workflow, internal tooling, and product-market-fit decisions for the 西谷智灯暗涌系统 coding agent.
---

# 西谷AI / 西谷智灯暗涌系统运营技能

此技能覆盖西谷AI (Xigu AI) 的内部运营决策、西谷智灯暗涌系统产品策略和中国AI市场背景。

## 产品定位

西谷智灯暗涌系统是 VoltUI 的中国本土化 fork，定位为：

- **目标用户**: 中国开发者团队和企业内网部署
- **核心差异**: 本土化品牌、CNB 云构建支持、中文交互优先、合规适配
- **技术栈**: 与上游 VoltUI 完全一致 (Go CLI + Wails Desktop)，仅通过 BrandConfig 定制品牌

## Fork 筡理策略

### 核心原则：源码与上游保持一致

| 改动类型 | 是否允许 | 实现方式 |
|---|---|---|
| 品牌定制 | ✅ | `VOLTUI_BRAND_NAME` 环境变量 + `[brand]` 配置段 |
| CI/CD 配置 | ✅ | `.cnb.yml` (CNB CI 管道) |
| 同步脚本 | ✅ | `scripts/sync-upstream.sh` |
| 源码硬编码品牌替换 | ❌ | 违反 BrandConfig 设计，破坏上游同步 |
| 新功能代码 | ⚠️ | 先贡献上游 PR，再在 fork 中享受 |

### 上游同步流程

1. **定时同步**: CNB CI 每天 09:00 CST 自动 `git merge upstream/main`
2. **冲突解决**: 优先采纳上游版本，保留 `.cnb.yml` 定制
3. **验证**: merge 后运行 `make build` + `go test ./...`

### 向上游贡献流程

1. 在 fork 中发现有价值的功能改进
2. 基于 `upstream/main` 创建干净分支（不含品牌定制）
3. 推送到 `upstream` 仓库，创建 PR
4. 上游合并后，下次定时同步自动获取

## 发布流程

### 桌面端发布（3 个原生 runner）

```
feat: 新功能 → CNB CI → desktop-v* tag → GitHub Actions → macOS/Windows/Linux 安装包
```

1. 开发者推送 `feat:` 提交到 `main`
2. CNB CI 检测到约定式提交，计算版本号
3. 创建 `desktop-v*` tag 并推送
4. GitHub Actions 在原生 runner 上构建：
   - `macos-14`: `.zip` + `.dmg` (universal)
   - `windows-latest`: `-installer.exe` (NSIS)
   - `ubuntu-22.04`: `.tar.gz` (amd64)
5. 产物发布到 GitHub Releases

### 品牌名在产物中的体现

- 环境变量 `VOLTUI_BRAND_NAME=西谷智灯暗涌系统` → 产物命名 `西谷智灯暗涌系统-darwin-universal.zip`
- Release title: `西谷智灯暗涌系统 desktop-v1.6.0`
- 安装包内应用名: `西谷智灯暗涌系统.app` / `西谷智灯暗涌系统.exe`

## 中国AI市场背景

### 合规要点

- 内容安全: 系统提示词需遵守中国 AI 内容安全规范
- 数据本地化: 企业客户可能要求数据不出境
- 开源合规: VoltUI 使用 MIT + Apache 2.0 双许可

### 竞争格局

| 产品 | 框架 | 定位 |
|---|---|---|
| 西谷智灯暗涌系统 (VoltUI fork) | Go + Wails | 本土化编码 Agent |
| Cursor | Electron | 国际化 AI 编码 IDE |
| CodeBuddy | 云 IDE | 中国 AI 编码助手 |
| Claude Code | CLI | Anthropic 编码 Agent |

### 差异化优势

1. **Go 性能**: 比 Electron 类产品内存占用低 10x
2. **本地运行**: 无需云端，企业内网友好
3. **多模型**: 支持 DeepSeek/OpenAI/本地模型切换
4. **MCP 协议**: 内置 MCP 服务器支持（time, Context7, filesystem 等）

## 内部工具链

| 工具 | 用途 | 位置 |
|---|---|---|
| `.agents/` | Agent team 配置、角色、工作流 | 项目根目录 |
| `references/skills/` | 技能知识库（含上游 + 西谷智灯暗涌系统专属） | 项目根目录 |
| `.cnb.yml` | CNB CI/CD 管道配置 | 项目根目录 |
| `scripts/sync-upstream.sh` | 上游同步脚本 | `scripts/` |

## Decision Protocol

遇到涉及产品方向的决策时：

1. **功能改动**: 先评估是否应该贡献上游 → 如果通用，提 PR 到 volt-gui
2. **本土化定制**: 评估是否可以通过 BrandConfig 实现 → 如果可以，不改源码
3. **市场决策**: 参考 `暗涌.md` 产品策略文档

## Directive

西谷智灯暗涌系统 fork 的所有改动必须遵循「配置优先」原则：
- 品牌定制 → BrandConfig 环境变量/配置段
- CI 定制 → `.cnb.yml`
- 功能改动 → 先贡献上游 PR
- 源码始终与上游一致，确保无缝同步