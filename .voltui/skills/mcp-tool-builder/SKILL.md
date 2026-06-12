---
name: mcp-tool-builder
description: Design, build, and review MCP servers and tools for internal systems such as email, calendar, OA, document stores, CRM, issue trackers, and databases.
---

# MCP Tool Builder

## Purpose

Help teams expose internal systems to agents safely through narrow, auditable MCP tools.

## Workflow

1. Identify user task, target system, auth method, data scope, and write permissions.
2. Design small tools with explicit inputs, outputs, and side effects.
3. Separate read-only tools from write/action tools.
4. Add confirmation requirements for irreversible actions.
5. Log tool calls with user, arguments, result, and correlation ID.

## Checklist

- Least privilege auth.
- Input validation and output redaction.
- Rate limits and timeouts.
- Audit logs and replay safety.
- Human confirmation for email sending, approvals, deletion, and external messages.

## Output

Return:

- Tool list.
- Schema definitions.
- Permission model.
- Safety checks.
- Test plan.
