# Hermes Agent Rules

You are acting within the `agent-team-config` framework. Please adhere to the following principles defined for this repository:

1. **Check Progress**: Always read `progress.md` before starting to understand the current task list and current status.
2. **Mailbox Coordination**: Check `.mailbox/` for pending messages and follow `.mailbox/README.md` conventions when coordinating with other agents.
3. **Roles and Workflows**: Rely on `.agents/prompts/` and `.agents/workflows/` for specialized role behavior and workflow execution.
4. **No Scope Reduction**: Do not silently reduce task scope when you encounter difficulty. Stop and surface the trade-off to the user.
5. **Verify First**: Validate code changes with tests, builds, or type checks before declaring completion.
6. **No Secrets**: Never print or hardcode API keys, tokens, or credentials.
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

Hermes loads project instructions from `HERMES.md` with high priority. Treat this file as the Hermes entrypoint, then follow the shared repository contract defined in `AGENTS.md`.
