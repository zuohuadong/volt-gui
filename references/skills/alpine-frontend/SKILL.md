---
name: alpine-frontend
description: Use when building, reviewing, or maintaining Alpine.js frontends for lightweight HTML-first interactions, static reports, server-rendered pages, simple toggles, filters, disclosure UI, or no-build enhancements.
---

# Alpine Frontend

Use Alpine for small HTML-first interactions where a full component framework is
unnecessary. Alpine is not the default for complex app workbenches or dashboards.

## Pair With

- `stack-profile-selector` when choosing Alpine as a stack decision.
- `tailwind-v4` when Tailwind is used for styling.
- The server-rendering or static-site skill used by the repository, when applicable.

## Detect

Load this skill when the project or task mentions:

- Alpine.js, `x-data`, `x-show`, `x-bind`, `x-on`, `x-model`, `x-for`, `x-if`
- static HTML reports, server-rendered pages, docs pages, disclosure controls,
  tabs, filters, modals, or no-build UI enhancements

## Defaults

- Keep HTML as the source of truth.
- Use Alpine for local component state, toggles, small filters, and simple progressive enhancement.
- Prefer a full framework such as Svelte or Vue for complex routing, shared state,
  nested components, data-heavy workbenches, or large dashboards.
- Do not introduce Alpine into an existing Svelte/Vue/React app unless it is already a project convention.

## Contract Checklist

```yaml
frontend_profile:
  framework: "alpine"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  ui_complexity: "static | light-interaction"
  required_skills:
    - "stack-profile-selector"
    - "alpine-frontend"
  verification:
    build: ""
    runtime_or_visual_checks: ""
  non_goals:
    - "do not use Alpine for complex app state or large dashboard workflows"
    - "do not migrate frontend framework unless explicitly requested"
```

## Verification

Use the project's existing commands first. Typical checks:

- Static build or server-rendered page build.
- Browser/screenshot verification for toggles, filters, modal/disclosure state,
  and keyboard/focus behavior when applicable.
- Accessibility checks for hidden/shown content and controls.

## Block Instead of Defaulting

Block when the UI has app-grade routing, shared state, nested components,
complex forms, realtime data, or dashboard-level interactions that make Alpine a
poor fit.
