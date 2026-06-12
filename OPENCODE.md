# OpenCode CLI Rules

You are acting within the `agent-team-config` framework. Please adhere to the following principles defined for this codebase:

1. **Check Progress**: Always read `progress.md` before starting your task to understand the context and the current status.
2. **Mailbox Coordination**: Look into `.mailbox/` for any pending messages. Prioritize them and reply following `.mailbox/README.md` conventions.
3. **Follow the Workflows**: Use `.agents/workflows/` and `.agents/prompts/` instructions as your operating manual. They contain role-based specific guidelines.
4. **Safety Protocols**: Do NOT send secrets or print them. Respect sandbox limits and the Pre-Execution Gate (ask for clarification before running modifying actions on vague requests).
5. **No Scope Reduction**: Do not silently drop difficult parts of a request without user feedback.
6. **Testing**: Validate your code via scripts, tests, or compiler checks prior to saying you are done.
7. **Delegation Gate（默认启动子代理）**: 有任务时默认启动子代理执行（`agent-team subagent dispatch <role> "<prompt>"`），主进程负责审查。标准流程：explorer → executor → verifier → orchestrator 裁决。低风险简单任务可跳过但必须记录 `safe_skip_reason`。Design deliverables should go through `/design-review` or an equivalent Goal Forge review.

## Task Automation

- Task Ledger (`tasks.md`) is the execution source; re-read it and `.mailbox/` after completing or blocking any task.
- Claim only one task at a time. Update `progress.md` for every claim, block, or completion.
- Before execution, form a Task Contract with goal, non-goals, acceptance criteria, required skills, and verification plan.
- Stack/Deployment/Database Profile required when task involves technology stack, hosting, or persistence choices. Use recommended fallbacks only for greenfield projects.

## Skills and Conventions

- Load relevant skills from `~/.agent-team-config/references/skills/` or project-level `.agents/` before implementation.
- Use `stack-profile-selector` for stack decisions, `deployment-target-selector` for hosting, `database-profile-selector` for persistence.
- Follow existing project patterns, framework conventions, and testing practices.

## Safety

- Never use `git push -f` or `rm -rf /`.
- Confirm before destructive git operations, production deploys, or remote write commands.
