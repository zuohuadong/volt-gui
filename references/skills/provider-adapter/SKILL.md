---
name: provider-adapter
description: Use when implementing or reviewing provider adapters and diagnostics for GitHub, CNB, GitLab, or local task ledgers, including remote detection, issue/PR/MR state mapping, CI visibility, auth checks, and consistency with Task Ledger review state.
---

# Provider Adapter

Use this skill for `automation doctor`, provider detection, PR/MR consistency checks, and any code or prompt that maps external platforms into agent-team Task Contracts.

## Adapter Boundary

Provider adapters translate platform state into Task Ledger and Task Contract fields. They should not decide task scope or rewrite contract semantics.

Minimum normalized fields:

- provider: `github` | `cnb` | `gitlab` | `local`
- repo slug
- source URL
- change request URL
- state: ready/running/review/blocked/done
- CI/check summary
- mergeability or conflict state when available

## Diagnostics

Prefer read-only checks:

- GitHub: `gh auth status`, `gh repo view`, `gh run list`, `gh pr view --json state,isDraft,mergeable,statusCheckRollup,url`
- CNB: `git ls-remote`, `.cnb.yml`, `CNB_TOKEN` or `CNB_API_TOKEN` for API checks
- GitLab: `git ls-remote`; use `glab` only when available
- Local: parse `tasks.md` and inspect mailbox/progress only

Set `GIT_TERMINAL_PROMPT=0` for non-interactive git checks.

## Review Consistency

For a task in `review`:

- Change request URL must exist and match the detected provider.
- PR/MR/pull must be visible and open.
- Draft/WIP review items should warn or block auto-merge.
- Failing checks block auto-merge.
- Pending checks warn unless project rules allow waiting.
- Closed/merged PR/MR must update the ledger or create a follow-up only when needed.

## Failure Handling

- Missing CLI or token is a warning unless the operation requires that provider.
- Unreadable PR/MR is a warning for health checks and a blocker for merge decisions.
- Never infer success from a provider API failure.
- Never log tokens, Authorization headers, or raw secret-bearing URLs.
