---
name: supacloud-platform
description: Use when building, deploying, or reviewing SupaCloud-hosted projects, including Supabase-style backend needs, frontend hosting, Edge Functions, project lifecycle, Caddy gateway, auth/storage/database, or self-hosted multi-tenant operations.
---

# SupaCloud Platform

Use SupaCloud when a project benefits from the user's self-hosted Supabase-style
platform rather than a static-only or generic edge deployment.

## Pair With

- `deployment-target-selector` for platform selection.
- `typescript`, `elysiajs`, or frontend skills as required by the project.
- `provider-adapter` when CI/PR/provider state affects deployment.

## Good Fit

- Supabase-style projects needing Postgres, auth, storage, edge functions, or realtime/log surfaces.
- Multi-tenant project lifecycle managed by a control plane.
- Apps that should stay in the user's own infrastructure.
- China/private-infra deployments where self-hosting and Caddy gateway control matter.
- Projects that need SupaCloud Pages/static frontend hosting plus backend services.

## Poor Fit

- Simple static sites, docs, or marketing pages without backend state.
- One-off public frontend demos where Cloudflare Pages or EdgeOne Pages is simpler.
- Projects where the user wants a fully managed third-party cloud instead of operating infrastructure.

## Contract Checklist

```yaml
deployment_profile:
  target: "supacloud"
  runtime_kind: "static | edge-function | fullstack | backend"
  target_region: "private-infra | china-mainland | unknown"
  domain_dns_owner: "supacloud-caddy | existing | unknown"
  stateful_services: ["postgres", "auth", "storage", "edge-functions"]
  secrets_strategy: ""
  required_skills:
    - "deployment-target-selector"
    - "supacloud-platform"
  verification:
    build: ""
    deploy_or_dry_run: ""
    runtime_smoke: ""
    rollback: ""
```

## Verification

Use project-specific scripts first. Typical checks:

- Local build or bundle check before deploy.
- SupaCloud CLI/admin status checks when available.
- Version or health endpoint after deploy.
- Domain/Caddy route verification for frontend hosting.
- Logs or runtime smoke for edge functions and backend routes.
- Rollback path for binary/static artifact replacement.

## Safety Rules

- Do not touch production hosts without identifying the active service, domain,
  route, and rollback artifact.
- Do not assume a legacy frontend path is active; verify route/service/build path.
- Do not expose service role keys or platform tokens in logs or generated files.
- Treat SupaCloud as a platform choice, not a default for every beginner project.
