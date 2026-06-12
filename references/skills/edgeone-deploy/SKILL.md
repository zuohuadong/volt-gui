---
name: edgeone-deploy
description: Use when deploying or reviewing Tencent Cloud EdgeOne Pages or Edge Functions, especially for China/mainland latency, Tencent Cloud ecosystem, CDN/DNS edge hosting, static sites, or serverless edge code.
---

# Tencent EdgeOne Deploy

Use EdgeOne when Tencent Cloud, China/mainland edge delivery, or EdgeOne Pages /
Edge Functions are the right deployment surface.

## Pair With

- `deployment-target-selector` for target selection.
- Frontend skills for the app being deployed.
- `typescript` for edge function code.

## Good Fit

- Static sites and frontend apps where Tencent/EdgeOne account and DNS are available.
- China/mainland or Tencent Cloud ecosystem deployments.
- Lightweight edge functions, request handling, middleware, and serverless logic at the edge.
- Projects where EdgeOne Pages gives simpler deploy/preview than operating a server.

## Poor Fit

- Full stateful backends without a separate database/storage plan.
- Projects requiring SupaCloud/Supabase-compatible auth/storage/database.
- Deployments where Cloudflare is already the DNS/account/provider of record.

## Contract Checklist

```yaml
deployment_profile:
  target: "edgeone-pages | edgeone-functions"
  runtime_kind: "static | edge-function | fullstack"
  target_region: "china-mainland | global | unknown"
  domain_dns_owner: "tencent-edgeone | existing | unknown"
  stateful_services: []
  secrets_strategy: ""
  required_skills:
    - "deployment-target-selector"
    - "edgeone-deploy"
  verification:
    build: ""
    local_preview: ""
    deploy_or_dry_run: ""
    runtime_smoke: ""
    rollback: ""
```

## Verification

Use the project's existing commands and EdgeOne docs/CLI/console flow. Typical
checks:

- Static build output exists and matches configured output directory.
- Edge function bundle/build succeeds before upload.
- Preview/custom domain URL responds with expected version or page content.
- Environment variables and secrets are configured outside source control.
- Rollback or previous deployment recovery is documented.

## Block Instead of Defaulting

Block when account access, DNS ownership, region/compliance requirements,
runtime limits, secrets strategy, or stateful service dependencies are unknown.
