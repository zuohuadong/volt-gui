# 桌面工作台契约

本文定义 VoltUI 下一代桌面 GUI 的上游契约。它是 Svelte 工作台重写的产品与工程目标；下游 fork 可以换主题或品牌，但交互模型应保持通用。

## 目标

- 保留 Go/Wails 内核，以 provider、工具、权限、checkpoint、MCP、skills、memory、session 为事实来源。
- 将当前以聊天为中心的 React 壳替换为 Svelte 5 工作台；聊天只是项目操作台中的一个界面。
- 显式区分 **Work** 与 **Code** 两个顶层活动模式，同时不改变现有运行模式（`Ask`、`Auto`、`YOLO`、`Plan`、`Goal`）。
- 使用兼容 `svadmin` 的 headless Svelte admin/workbench 层来承载 provider、model、skill、MCP server、permission、task、memory、审计日志等资源型界面。
- 保持当前 Wails 分发特性：轻量桌面运行时、本地优先、不要求 Electron/Node server、构建产物能在 `wails://` scheme 下加载。

## 非目标

- 不把桌面运行时从 Wails 迁移到 Electron。
- 不把 agent 内核从 Go 迁移到 Node server。
- 不在上游 UI 代码中写入 fork 专属品牌、市场或部署决策。
- 不把桌面 GUI 做成纯 CRUD 后台。资源/管理组件用于加速设置和运维界面；主体验仍然是 agent 工作台。

## 活动模式

活动模式描述用户任务领域，和运行模式正交。

| 活动模式 | 用途 | 主要界面 |
| --- | --- | --- |
| `work` | 通用 agent 工作、研究、写作、计划、办公类任务与任务协同。 | 工作台首页、聊天、目标、任务、记忆、MCP 资源、命令面板。 |
| `code` | 在仓库或工作区中的编码 agent 工作。 | 项目树、文件引用、变更文件、diff、checkpoint、shell/工具轨迹、上下文面板、审批。 |

运行模式保持现有含义：

| 运行模式 | 含义 |
| --- | --- |
| `Ask` | writer 兜底审批时询问。 |
| `Auto` | 自动放行兜底审批；显式 `ask` 与 `deny` 规则仍生效。 |
| `YOLO` | 跳过普通工具审批；硬性 deny、用户问题与计划审批仍会等待。 |
| `Plan` | 下一轮保持只读，直到计划被批准或关闭 Plan。 |
| `Goal` | 持续追踪一个已保存目标，直到完成、阻塞或清除。 |

UI 不能把活动模式和运行模式合并成一个控件。用户应能清楚地组合 `code + Plan`、`code + Ask`、`work + Goal` 或 `work + Auto`。

## 工作台布局

桌面工作台由稳定区域组成：

- **应用顶栏**：原生感标题区域、项目/会话标签、命令面板入口、紧凑状态。
- **主侧边栏**：活动切换、workspace/project、session/topic、task/goal、settings 入口。
- **主舞台**：当前对话、工作台首页或聚焦 artifact。
- **输入区**：消息输入、附件、`@` 引用、斜杠命令、模型/effort/运行模式控件、活动模式上下文。
- **右侧停靠区**：context、files、changed files、plan、approvals、tool trace、resource inspector。
- **资源界面**：设置和 admin-style 页面应由类型化资源驱动，不再堆叠一次性表单。

第一屏应该是可用工作台，不是营销页或纯引导页。空状态可以提示用户，但必须暴露真实操作。

## svadmin 兼容层

VoltUI 应使用 Svelte 资源原语承载管理型界面。该层应兼容 `svadmin` 概念，但不能让后台系统假设泄漏到 agent 专属组件。

推荐资源名：

- `providers`
- `models`
- `mcpServers`
- `skills`
- `permissions`
- `workspaces`
- `sessions`
- `topics`
- `tasks`
- `memory`
- `checkpoints`
- `updates`

推荐 provider 边界：

```ts
interface WorkbenchDataProvider {
  list(resource: string, params: ListParams): Promise<ListResult>;
  getOne(resource: string, id: string): Promise<ResourceRecord>;
  create(resource: string, data: unknown): Promise<ResourceRecord>;
  update(resource: string, id: string, data: unknown): Promise<ResourceRecord>;
  delete(resource: string, id: string): Promise<void>;
}
```

在 Wails 桌面端，这个 provider 应包装现有 Go bindings，即 `desktop/frontend/src/lib/bridge.ts` 或它的 Svelte 替代层。Wails 必须保持唯一的桌面 IPC 边界。

## 第一阶段必需功能

第一版可用 Svelte 工作台必须支持：

- Wails 启动路径和浏览器开发 mock 路径。
- tab/session 列表、切换、关闭、新建 topic。
- 发送用户 turn 并接收流式事件。
- 渲染 assistant 文本、reasoning、usage、工具调用、approval、ask question。
- 输入区文本、斜杠命令、`@` 文件/workspace 引用、附件、取消。
- 模型和 effort 切换。
- 显式 Work/Code 活动模式切换。
- 现有运行模式：Ask/Auto/YOLO、Plan、Goal 入口。
- provider、model、MCP server、skill、permission 的设置/资源界面。
- Code 模式右侧停靠区：context、files、changed files、diff、checkpoint。
- Work 模式首页：task/goal、最近 session、memory、resource shortcut。

功能可以分切片合入，但重写完成的标准是以上项目全部可用并通过验证。

## 迁移计划

1. **契约与功能矩阵**：重写过程中维护本文和可检查的功能矩阵。矩阵见
   [`WORKBENCH_FEATURE_MATRIX.md`](./WORKBENCH_FEATURE_MATRIX.md)。
2. **并行 Svelte 壳**：在独立目录或分支中创建 Svelte 5 + Vite 桌面前端，直到它能替换 `desktop/frontend`。
3. **Bridge adapter**：通过类型化 Svelte service 和 svadmin 兼容 data provider 暴露 Wails bindings。
4. **核心循环**：实现 tabs、event stream、transcript、composer、approval/question、模型控件。
5. **活动模式**：加入 Work/Code 模式切换，并分别提供 dashboard 与 code workspace 界面。
6. **资源界面**：将设置和运维面板迁移为类型化资源。
7. **替换 React 壳**：只有通过等价功能门禁后，才把 Wails 构建命令切到 Svelte 前端。
8. **删除旧 React**：最终替换 PR 删除 React 依赖和死组件。

## 验证门禁

每个实现切片都要选择能覆盖改动面的最小真实门禁。最终替换必须通过：

- 前端类型检查（`svelte-check` 或项目 check 命令）。
- 前端生产构建。
- 至少一个主要开发平台的 Wails 桌面构建。
- Browser 或 Wails runtime smoke，证明 UI 非空白。
- Event-stream smoke：提交一轮并渲染流式文本/工具事件。
- Approval smoke：展示审批请求并响应。
- Work/Code smoke：切换活动模式并保持已选运行模式。
- Resource smoke：通过 data provider 列出并更新至少一种资源。
- `git diff --check`。

如果宽范围测试被无关仓库状态阻断，必须记录精确阻塞原因，并运行能覆盖改动文件的定向门禁。
