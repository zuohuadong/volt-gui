---
name: svadmin-admin-ui
description: Use when building or reviewing admin/backoffice CRUD interfaces with svadmin, including Svelte 5 admin panels, DataProvider/AuthProvider/LiveProvider, resource definitions, RBAC, audit logging, and backend adapters.
---

# svadmin Admin UI

Use svadmin for admin/backoffice surfaces. It is a headless Svelte 5 admin
framework, not a general public-site framework or hosting platform.

## Pair With

- `deployment-target-selector` when deciding whether an admin UI is needed.
- `svelte-code-writer` and `svelte-core-bestpractices` for Svelte code.
- `typescript` for resource/provider types.
- Backend skills such as `elysiajs` or `supacloud-platform` when wiring data/auth.

## Good Fit

- CRUD admin panels, resource management, internal tools, operations dashboards.
- Projects with REST, Supabase/SupaCloud, Elysia, Drizzle, GraphQL, or other data providers.
- Auth/RBAC, audit logging, import/export, realtime admin needs.
- Newcomer projects that need a usable admin surface without hand-building every table/form.

## Poor Fit

- Public landing pages, marketing sites, editorial sites, games, or consumer apps.
- Small static pages where Alpine or plain HTML is enough.
- Projects that are not Svelte-compatible and do not want a Svelte admin surface.

## Contract Checklist

```yaml
admin_profile:
  framework: "svadmin"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  backend_provider: "simple-rest | supacloud | supabase | elysia | drizzle | graphql | unknown"
  resources: []
  auth_required: true
  rbac_required: false
  audit_required: false
  required_skills:
    - "svadmin-admin-ui"
    - "svelte-code-writer"
    - "svelte-core-bestpractices"
  verification:
    typecheck: ""
    lint: ""
    build: ""
    runtime_or_visual_checks: ""
  non_goals:
    - "do not use admin UI as the public product UI unless explicitly requested"
```

## Verification

Use the project's existing commands first. Typical checks:

- `bun run check`, `bun run lint`, `bun test`, and build commands.
- Resource list/form/show flows for each changed resource.
- Auth/RBAC behavior where permissions are touched.
- Browser screenshot or runtime smoke for visible admin changes.

## Block Instead of Defaulting

Block when the backend provider, auth model, resources, RBAC, or audit
requirements are unknown, or when the task asks for a public app rather than an
admin/backoffice surface.
