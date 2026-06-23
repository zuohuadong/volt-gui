# Task Contract Template

> 用于把 GitHub Issue、CNB Issue、GitLab Issue 或本地 `tasks.md` 统一成自动化可执行的任务契约。

```yaml
task_id: ""
provider: "local" # github | cnb | gitlab | local
repo: ""
source_url: ""
status: "ready" # ready | running | review | blocked | invalid | done
risk: "low" # low | medium | high
priority: "normal" # low | normal | high | urgent
owner: ""
model: "gpt-5.3-codex"
needs_model: ""
review_class: "" # review-low | review-high
escalation_reason: ""
branch: ""
change_request_url: ""
created_at: ""
updated_at: ""
```

## Goal

写清楚任务目标。

## Non-goals

写清楚不做什么，避免自动执行时扩大范围。

## Acceptance Criteria

- [ ] 可验证标准 1
- [ ] 可验证标准 2

## Expected Scope

- 预计修改的模块、文件或目录

## Goal Forge

> 当设计文档、架构/API/数据模型、迁移方案或高风险计划本身是交付物时填写；普通实现任务可保持 disabled。

```yaml
goal_forge:
  enabled: false
  runtime: "binary | npm-package | source-checkout | unavailable"
  binary_path: "env:GOAL_FORGE_BIN | PATH:goalforge | PATH:goal-forge | unknown"
  package_spec: "@goalforge/cli@latest | pinned package | none"
  checkout_path: "../goal-forge | env:GOAL_FORGE_PATH | env:GOAL_FORGE_HOME | none"
  run_dir: ""
  config_path: ".agents/goal-forge/goal-forge.config.json"
  ledger_paths: []
  adapter: "local | codex | openai | none"
  evidence_summary: ""
  verification:
    status_check: "agent-team goal-forge status ."
    init_check: "agent-team goal-forge init . '<goal>'"
    run_check: "agent-team goal-forge run . '<runDir>' --adapter local"
  non_goals:
    - "do not vendor Goal Forge into this project"
    - "do not require model-backed Goal Forge runs during deploy"
    - "do not place secrets in Goal Forge config or ledgers"
```

## Delegation Gate

```yaml
delegation:
  triggers_checked:
    risk: "low | medium | high"
    multi_subsystem: false
    architecture_api_data_security_production: false
    external_research: false
    review_of_own_work: false
  required: false
  subagents:
    - role: "explorer | critic | verifier | worker"
      model: "gpt-5.3-codex | gpt-5.5"
      escalation_reason: ""
      scope: ""
      ownership: "read-only | write"
      allowed_files: []
      context_isolation: "isolated | shared-readonly | shared-write | blocked"
      shared_context_allowed: []
      handoff_artifacts: []
      verification_command: ""
      output_schema: "verdict, evidence, blocking_findings, non_blocking_risks, recommended_next_action"
      mailbox_persistence: "required | optional | none"
      mailbox_ref: ""
  interruption_recovery:
    resume_state: "not-needed | resumable | blocked | unknown"
    last_stable_artifact: ""
    dangling_subagents: []
    recovery_owner: "orchestrator | original-subagent | verifier | blocked"
    recovery_action: "continue | rerun-subagent | request-human | mark-blocked | none"
    placeholder_evidence: []
  safe_skip_reason: ""
```

规则：

- `gpt-5.3-codex` 是默认执行器和 explorer/critic/verifier sidecar。
- `gpt-5.5` 只用于主仲裁、高风险审查、生产/安全/数据/不可逆决策或 reviewer 分歧裁决，必须写 `escalation_reason`。
- 并行 worker 只有在 `allowed_files` 明确互斥时才允许。
- 子代理默认 `context_isolation: isolated`，只能通过 `handoff_artifacts`、`.mailbox/` 和 Task Contract 字段交换证据；不要假设其他子代理上下文可见。
- `shared-write` 只允许在文件所有权明确互斥且 Orchestrator 记录合并策略时使用；否则标 `blocked`。
- 子代理中断、超时或输出不完整时，先记录 `interruption_recovery`，再决定续跑、重派或阻塞；不要把半截输出当作完成证据。
- 中/高风险任务进入 `review` / `done` 时，应在机器可读 task state 记录 subagent evidence 或 safe skip reason。

## Skill Loading

```yaml
skill_loading:
  required_skills: []
  optional_skills: []
  activation_mode: "auto | explicit | task-contract | disabled"
  progressive_loading: true
  loaded_for_turn: []
  disabled_skills: []
  metadata_required:
    - "name"
    - "description"
  compatibility_notes: []
  non_goals:
    - "do not load every installed skill into every prompt"
    - "do not bypass project AGENTS.md or task-specific conventions"
```

规则：

- 默认渐进加载：先读取 skill 元数据和索引，只有任务命中时才完整读取 `SKILL.md` 及其必要引用。
- 明确用户写出 `/skill-name` 或 Task Contract 指定 skill 时，可视为单轮显式激活；仍需遵守禁用列表、项目规则和安全边界。
- `.skill` 归档或外部 skill 若被引入，应至少保留 `name`、`description`，推荐记录 `version`、`author`、`compatibility`；外部来源不能成为运行时 live dependency，除非任务契约显式允许。

## Run Record

```yaml
run_record:
  enabled: false
  run_id: ""
  schema_path: ".agents/state/run-records.schema.json"
  record_path: ".agents/state/runs/<run_id>.json"
  trace_tags: []
  evidence_refs: []
  privacy:
    secrets_redacted: true
    raw_logs_stored: false
```

规则：

- `progress.md` 面向人类协作；run record 面向 automation doctor、dashboard 和后续观测工具。
- 默认不接入 LangSmith/Langfuse；若未来接入，只引用 run record 的 ID、标签和证据路径，不上传 secrets 或完整 mailbox 历史。
- 中/高风险、长程、多子代理或需恢复的任务建议开启 run record。

## Stack Profile

> 只有当任务创建、扩展或依赖技术栈、Fullstack Web、数据库或部署选择时才需要填写对应 profile。推荐栈/推荐数据库/推荐平台只是 greenfield fallback，不得覆盖已有项目证据。

```yaml
stack_profile: ""
stack_decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
stack_maturity: "mature | modern | experimental | existing"
stack_evidence: []
default_stack_reason: ""
stack_non_goals:
  - "do not migrate framework unless explicitly requested"
  - "do not rewrite build tooling unless explicitly requested"
```

后端/API 任务补充：

```yaml
backend_profile:
  framework: "existing | elysia | nestjs | hono | blocked"
  runtime: "bun | node | edge | deno | unknown"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  architecture_weight: "light | standard | heavy | unknown"
  required_capabilities: []
  required_skills: []
  verification:
    typecheck: ""
    lint: ""
    test: ""
    build: ""
    runtime_smoke: ""
  non_goals:
    - "do not migrate backend framework unless explicitly requested"
```

前端 UI 任务补充：

```yaml
frontend_profile:
  framework: "existing | svelte | vue | alpine | blocked"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  ui_complexity: "static | light-interaction | app-workbench | dashboard | unknown"
  required_skills: []
  verification:
    typecheck: ""
    lint: ""
    build: ""
    runtime_or_visual_checks: ""
  non_goals:
    - "do not migrate frontend framework unless explicitly requested"
```

Fullstack Web / SSR / SSG / 路由任务补充：

```yaml
fullstack_profile:
  framework: "existing | sveltekit | nuxt | separated-frontend-backend | blocked"
  render_mode: "static | spa | ssr | hybrid | unknown"
  api_surface: "none | server-routes | separate-api | edge-functions | unknown"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  adapter_or_platform: ""
  required_skills: []
  verification:
    typecheck: ""
    lint: ""
    build: ""
    runtime_or_preview: ""
  non_goals:
    - "do not migrate fullstack framework unless explicitly requested"
```

部署或托管目标任务补充：

```yaml
deployment_profile:
  target: "existing | none | supacloud | svadmin | edgeone-pages | edgeone-functions | cloudflare-pages | cloudflare-workers | cloudflare-pages-functions | blocked"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  runtime_kind: "static | edge-function | fullstack | backend | admin-ui | unknown"
  target_region: "global | china-mainland | private-infra | unknown"
  data_residency: "none | public-content | user-data | sensitive | unknown"
  domain_dns_owner: "cloudflare | tencent-edgeone | supacloud-caddy | existing | unknown"
  stateful_services: []
  secrets_strategy: ""
  required_skills: []
  verification:
    build: ""
    local_preview: ""
    deploy_or_dry_run: ""
    runtime_smoke: ""
    rollback: ""
  non_goals:
    - "do not migrate hosting provider unless explicitly requested"
    - "do not introduce a managed platform when a static/no-backend target is sufficient"
```

数据库或持久化任务补充：

```yaml
memory_profile:
  target: "none | sqlite-hybrid | local-file | mem0 | openmemory | tencentdb | blocked"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  scope: "global-user | project | task | repo | unknown"
  recall_token_budget: 1200
  save_policy: "stable-facts-only | disabled | provider-managed | unknown"
  secrets_strategy: "none | env-explicit | provider-managed | blocked"
  required_skills: []
  verification:
    status_check: "agent-team memory status ."
    recall_check: "agent-team memory recall '<query>' --token-budget 1200"
    save_check: "agent-team memory save decisions '<compact decision>'"
  non_goals:
    - "do not inject unbounded memory into prompts"
    - "do not require mem0/OpenMemory/TencentDB unless explicitly configured"
    - "do not wire TencentDB/OpenClaw L0-L3 into default core"
    - "do not migrate task ledgers, progress logs, or mailbox history into memory unless explicitly requested"
```

规则：

- 默认 `target: sqlite-hybrid`，使用 `.agents/state/memory/memory.db` 可重建索引；`.agents/state/project-memory.json`、`tasks.md`、`progress.md` 和 `.mailbox/` 仍是事实源。
- `local-file` 是旧 JSON-only fallback；`mem0` / OpenMemory / TencentDB 是外部 Agent Memory 方案的 opt-in adapter，不是默认 provider。
- TencentDB/OpenClaw L0-L3 自动记忆管线不进入默认 core；只定期审查 upstream release，并手工移植适合 `MemoryProvider` 抽象的去重、召回评分、保留策略等能力。
- 外部 provider 必须记录 secrets 策略、scope 边界和 token budget；不得硬编码 API key。
- `recall` 结果必须受 token budget 限制；记忆召回不能替代读取项目事实源。

```yaml
database_profile:
  target: "none | existing | sqlite | cloudflare-d1 | postgres | blocked"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  data_scope: "none | local-single-user | edge-app | multi-user | enterprise | unknown"
  consistency: "local-file | relational | transactional | globally-distributed | unknown"
  access_pattern: "embedded | server-only | edge-binding | direct-tcp | http-api | unknown"
  migration_strategy: ""
  backup_restore: ""
  required_skills: []
  verification:
    schema_check: ""
    migration_check: ""
    integration_test: ""
    runtime_smoke: ""
  non_goals:
    - "do not migrate database unless explicitly requested"
```

桌面应用任务补充：

```yaml
desktop_profile:
  kind: "desktop-app"
  runtime: "desktop-existing | electron | tauri | electrobun | unknown"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  maturity: "mature | lightweight-security | experimental | existing"
  evidence: []
  target_platforms: []
  distribution: "local | installer | app-store | enterprise | unknown"
  native_capabilities: []
  migration_scope: "none | small | large | blocked"
  required_skills: []
  verification:
    typecheck: ""
    build_targets: []
    runtime_smoke: ""
    package_check: ""
  non_goals:
    - "do not migrate desktop runtime unless explicitly requested"
```

移动端、小程序或 Mpx 任务补充：

```yaml
app_profile:
  kind: "mobile-app | miniapp | mpx-app"
  stack: "mobile-existing | mobile-expo-rn | mobile-capacitor-pwa | mobile-flutter | mobile-native | mini-existing | mini-native | mini-taro | mini-uniapp | mpx-app | unknown"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  target_platforms: []
  native_capabilities: []
  migration_scope: "none | small | large | blocked"
  required_skills: []
  verification:
    lint: ""
    typecheck: ""
    build_targets: []
    runtime_or_visual_checks: []
  non_goals:
    - "do not migrate framework unless explicitly requested"
```

Mpx 任务再补充：

```yaml
mpx:
  output_targets: []
  target_detection_evidence: []
  local_docs_checked: []
  preserve_directory_structure: true
  preserve_conditional_compile_style: true
  preserve_style_units: true
  rn_style_compat_required: false
```

## Required Skills and Conventions

- 相关 skill：
- 项目规则：
- 代码规范：
- 测试约定：

> 不确定相关 skill 时，先参考全局 `references/skills/INDEX.md` 或已安装的 `~/.codex/skills/agent-team/INDEX.md`，再结合项目级 `AGENTS.md` / `GEMINI.md` 补齐。

## Verification Plan

- 类型检查：
- 测试：
- 构建：
- 运行时/截图/接口验证：

## Risk and Rollback

- 风险：
- 回滚：

## Provider Notes

- GitHub/CNB/GitLab/local 的原始任务链接、标签、状态映射或备注。

## Parent and Follow-up

- parent_task_id:
- parent_source_url:
- related_pr_or_mr:
- follow_up_reason:
- why_not_reuse_original_pr:

## Review Escalation

- 若审查不合格，优先回到原 PR/MR 修复
- 只有当原 PR/MR 无法继续或问题已进入主线，才创建新的 follow-up 修复任务
- 新任务必须明确挂到 parent 下，不要作为孤立任务
