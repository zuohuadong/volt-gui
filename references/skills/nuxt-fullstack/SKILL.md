---
name: nuxt-fullstack
description: Use when building, reviewing, or maintaining Nuxt applications, including Vue file-based routing, SSR/SSG/hybrid rendering, Nitro server routes, modules, composables, and deployment target fit.
---

# Nuxt Fullstack

Use Nuxt when a Vue app needs routing, SSR/SSG, hybrid rendering, Nitro server
routes, module ecosystem integration, or a cohesive Vue fullstack application
shell.

## Pair With

- `stack-profile-selector` when choosing Nuxt as a fullstack decision.
- `vue-frontend` for Vue component work.
- `typescript` for TypeScript projects.
- `deployment-target-selector` and the concrete deployment skill when preset,
  Nitro target, or hosting platform affects the app shape.
- Database skills when server routes or data loaders persist data.

## Good Fit

- Vue apps that need file-based routing and application-level conventions.
- SSR, SSG, hybrid rendering, SEO/content sites, dashboards, and Vue ecosystem apps.
- Projects that benefit from Nuxt modules, Nitro server routes, server API, or
  a Vue-oriented team convention.
- Projects already using Nuxt or `nuxt`.

## Poor Fit

- A small Vue widget or SPA where Vite + Vue is enough.
- Static HTML with tiny no-build interactions where Alpine is simpler.
- Projects standardized on SvelteKit, React/Next, or a separate backend/frontend
  split unless migration is explicitly requested.

## Contract Checklist

```yaml
fullstack_profile:
  framework: "nuxt"
  render_mode: "static | spa | ssr | hybrid | unknown"
  api_surface: "none | server-routes | separate-api | edge-functions | unknown"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  adapter_or_platform: ""
  required_skills:
    - "stack-profile-selector"
    - "nuxt-fullstack"
    - "vue-frontend"
    - "typescript"
  verification:
    typecheck: ""
    lint: ""
    build: ""
    runtime_or_preview: ""
  non_goals:
    - "do not migrate frontend framework unless explicitly requested"
```

## Defaults

- Keep existing Nuxt routing, composable, module, Nitro, state, and style
  conventions.
- Choose SSR, prerendering, SPA mode, or hybrid rendering by route needs and
  deployment target.
- Keep server-only code in Nuxt server boundaries.
- Keep server routes small, validated, and covered by runtime smoke checks when
  user-facing behavior changes.

## Verification

Use the project's existing commands first. Typical checks:

- Nuxt/Vue typecheck or the repository typecheck command.
- Project lint and tests when present.
- Nuxt build/generate for the chosen target.
- Local preview or deployed runtime smoke for changed pages, server routes,
  auth, cookies, and database writes.

## Block Instead of Defaulting

Block when render mode, Nitro preset/deployment target, auth/session boundary,
database choice, or framework migration intent is unclear.
