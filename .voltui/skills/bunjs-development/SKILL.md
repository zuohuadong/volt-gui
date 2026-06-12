---
name: bunjs-development
description: Build and review Bun.js applications, APIs, scripts, and tooling. Use for Bun runtime behavior, package management, tests, bundling, native APIs, and Node compatibility.
---

# Bun.js Development

## Purpose

Help engineers use Bun for fast scripts, services, and tooling while respecting Node compatibility boundaries and production constraints.

## Workflow

1. Identify Bun version and whether the project targets Bun-only or Node-compatible execution.
2. Use Bun-native APIs when they simplify code and the runtime target is Bun-only.
3. Keep compatibility notes when using Node libraries or ESM/CJS interop.
4. Prefer `bun test`, lockfile discipline, and explicit scripts.
5. Check startup, file IO, HTTP server behavior, and bundling assumptions.

## Checklist

- `bun.lock`, install scripts, and supply-chain controls.
- ESM/CJS compatibility and package exports.
- Native `Bun.serve`, file, shell, SQLite, and bundler APIs.
- Test runner behavior and mocks.
- Container image, signals, health checks, and environment variables.

## Output

Return:

- Runtime compatibility notes.
- Implementation summary.
- Test/build commands.
- Deployment constraints.
