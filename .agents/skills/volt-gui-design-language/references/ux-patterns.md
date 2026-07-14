# Volt GUI UX patterns

## Contents

- Navigation and context
- Work and Code workbenches
- Conversation and composer
- Status and feedback
- Settings and governance
- Approvals and destructive actions
- Empty, loading, and error states
- Keyboard and accessibility

## Navigation and context

- Keep the hierarchy visible: Workspace -> Project -> Task/Thread -> Surface.
- Let users switch context without losing drafts or current inspection state.
- Put durable entities in navigation; put transient modes and filters near the content they affect.
- Preserve back/forward history for page and panel navigation when the host supports it.
- Show unread/running indicators in rows without moving the label or changing row height.

## Work and Code workbenches

### Work

- Optimize for goals, tasks, documents, automation, teams, agents, and durable outcomes.
- Lead with today/current commitments and the shortest next action.
- Use templates and ambient suggestions as accelerators, not fake seeded business data.

### Code

- Optimize for repository, branch, context usage, changed files, diff, checkpoints, terminal/processes, and review.
- Keep status/control information visible before the user sends a coding turn.
- Use side/bottom panels for inspection so the conversation remains continuous.

### Shared contract

- Share navigation, composer, notifications, status language, and configuration entry points.
- Keep Work/Code visually related but structurally distinct; mode color alone is insufficient.

## Conversation and composer

- Preserve a centered readable transcript while allowing wide artifacts, diff, tables, and code blocks to expand.
- Group reasoning, tool calls, approvals, outputs, and errors by turn.
- Keep active execution visible through status text, elapsed time, cancel affordance, and partial output.
- Support text, attachments, images, file references, commands, mentions, model choice, and permission choice without overwhelming the default state.
- Use a plus/menu trigger and contextual menus for advanced inputs. Keep common state visible in the footer.
- Preserve drafts per task/thread when users navigate away.

## Status and feedback

- Use concise state labels: Ready, Running, Waiting for approval, Blocked, Failed, Completed, Canceled.
- Pair color with icon/text. Never use a colored dot alone for important state.
- Show progress near the action that initiated it and persist durable results in the relevant task/thread.
- Use toasts for short confirmations; use inline banners/cards for recoverable problems that require action.
- Distinguish backend truth from optimistic UI. Do not show sample success content when data is unavailable.

## Settings and governance

- Use a grouped left navigation and a scrollable, bounded content column.
- Give every settings section a title, short explanation, current state, and clear save/apply behavior.
- Keep secrets masked and describe storage location without exposing values.
- Show dependency and availability states for providers, models, MCP servers, skills, plugins, browser/computer use, and updates.
- Prefer inline validation and a stable footer action over long forms with hidden save buttons.

## Approvals and destructive actions

- Present turn-level approvals inline with the request, scope, risk, and exact action.
- Require a modal confirmation for delete, irreversible reset, credential removal, or destructive rewind.
- Default focus to the safe action. Preserve Escape and keyboard cancellation.
- Explain what changes, what remains, and how to recover before executing a checkpoint/rewind action.

## Empty, loading, and error states

### Empty

- State why the surface is empty.
- Offer one primary next action and, at most, one secondary learning/recovery action.
- Use examples only when clearly labeled as templates, never as real user data.

### Loading

- Use skeletons for known stable layouts and compact progress rows for operations.
- Keep the shell and navigation interactive whenever safe.
- If loading exceeds a reasonable threshold, show which dependency is pending and expose retry/cancel.

### Error

- Name the failed operation in user language.
- Separate cause, impact, and recovery action.
- Keep already loaded content usable.
- Preserve diagnostic identifiers only when they help support or retry; avoid raw log dumps in the primary UI.

## Keyboard and accessibility

- Provide visible focus for every interactive element.
- Preserve logical Tab order across shell, content, side panels, and modal layers.
- Support Enter/Space for buttons, Escape for menus/modals, and arrow keys where the control semantics expect them.
- Keep control targets at least 32px on desktop and 40px on touch-oriented layouts.
- Respect reduced motion and system contrast/theme settings.
