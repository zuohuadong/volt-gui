---
name: vue-frontend
description: Use when building, reviewing, or maintaining Vue frontends, including Vue Single-File Components, Composition API, TypeScript, Vite integration, component state, and Vue ecosystem alignment.
---

# Vue Frontend

Use Vue when the user requests Vue, the project already uses Vue, the team
ecosystem is Vue-oriented, or the work benefits from Vue-style component
conventions such as Mpx/miniapp-adjacent teams.

## Pair With

- `stack-profile-selector` when choosing Vue as a stack decision.
- `typescript` for TypeScript Vue projects.
- `tailwind-v4` when Tailwind is used.
- `nuxt-fullstack` when the task involves Nuxt, SSR/SSG, Nitro server routes,
  modules, or fullstack Vue routing.
- `mpx-development-guides` when the task involves Mpx, `.mpx`, miniapp output,
  or Mpx2RN/Mpx2DRN.

## Detect

Load this skill when the project or task mentions:

- `.vue`, `vue`, `@vitejs/plugin-vue`, `vue-tsc`, Pinia, Vue Router
- Nuxt, Nitro, `nuxt.config`, server routes, modules, SSR, SSG, hybrid rendering
- Composition API, `<script setup>`, `defineProps`, `defineEmits`, `ref`, `computed`
- a Vue ecosystem or Mpx/miniapp team preference

## Defaults

- Prefer Vue Single-File Components for application UI.
- Prefer Composition API with `<script setup>` for new Vue 3 TypeScript code.
- Keep existing Options API, router, state, and style conventions when present.
- For Nuxt-specific routing, Nitro server routes, modules, SSR/SSG, or presets,
  load `nuxt-fullstack` and record `fullstack_profile`.
- Do not migrate React/Svelte/Alpine/other frontends to Vue unless explicitly requested.

## Contract Checklist

```yaml
frontend_profile:
  framework: "vue"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  ui_complexity: "static | light-interaction | app-workbench | dashboard | unknown"
  required_skills:
    - "stack-profile-selector"
    - "vue-frontend"
  verification:
    typecheck: ""
    lint: ""
    build: ""
    runtime_or_visual_checks: ""
  non_goals:
    - "do not migrate frontend framework unless explicitly requested"
```

## Verification

Use the project's existing commands first. Typical checks:

- `vue-tsc --noEmit` or the project typecheck command.
- `vite build`, Nuxt build, or the project build command.
- Component/unit tests when present.
- Browser or screenshot verification for visible UI changes.

## Block Instead of Defaulting

Block when the task implies framework migration, when the user only says "app"
without target surface, when SSR/SPA/static output is unclear, or when miniapp/Mpx
is inferred only from Vue preference without explicit evidence.
