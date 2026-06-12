---
name: sveltekit-fullstack
description: Use when building, reviewing, or maintaining SvelteKit applications, including file-based routing, SSR/SSG/SPA modes, server load functions, form actions, endpoints, adapters, and deployment target fit.
---

# SvelteKit Fullstack

Use SvelteKit when a Svelte app needs routing, SSR/SSG, server-side data loading,
form actions, endpoint routes, adapter-aware deployment, or a cohesive fullstack
application shell.

## Pair With

- `stack-profile-selector` when choosing SvelteKit as a fullstack decision.
- `svelte-code-writer` and `svelte-core-bestpractices` for component work.
- `typescript` for TypeScript projects.
- `deployment-target-selector` and the concrete deployment skill when adapter or
  hosting target affects the app shape.
- Database skills when load functions, actions, or endpoints persist data.

## Good Fit

- Svelte apps that need file-based routing and route-level data loading.
- SSR, SSG, prerendered docs, hybrid static/server pages, and form-heavy apps.
- Fullstack apps where UI, server actions, endpoints, and deployment adapter
  should be designed together.
- Projects already using SvelteKit or `@sveltejs/kit`.

## Poor Fit

- A simple Svelte widget or embedded UI where Vite + Svelte is enough.
- Static HTML with only tiny interactions where Alpine is simpler.
- Projects standardized on Vue/Nuxt, React/Next, or a separate backend/frontend
  split unless migration is explicitly requested.

## Contract Checklist

```yaml
fullstack_profile:
  framework: "sveltekit"
  render_mode: "static | spa | ssr | hybrid | unknown"
  api_surface: "none | server-routes | separate-api | edge-functions | unknown"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  adapter_or_platform: ""
  required_skills:
    - "stack-profile-selector"
    - "sveltekit-fullstack"
    - "svelte-code-writer"
    - "svelte-core-bestpractices"
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

- Keep SvelteKit routing, `load`, action, endpoint, and adapter conventions
  already present in the repository.
- Choose SSR, prerendering, SPA mode, or hybrid rendering by route needs and
  deployment target, not by habit.
- Keep server-only code out of client bundles.
- Keep form actions and endpoints small, validated, and covered by runtime smoke
  checks when user-facing behavior changes.

## Verification

Use the project's existing commands first. Typical checks:

- Svelte/SvelteKit typecheck.
- Project lint and unit/component tests when present.
- `build` for the chosen adapter.
- Local preview or deployed runtime smoke for changed routes, actions, endpoints,
  auth, cookies, and database writes.

## Block Instead of Defaulting

Block when render mode, adapter/deployment target, auth/session boundary,
database choice, or framework migration intent is unclear.
