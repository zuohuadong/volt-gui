---
name: typescript-development
description: Develop and review TypeScript code across frontend, backend, libraries, and tooling. Use for type safety, API contracts, refactors, tsconfig, package boundaries, and tests.
---

# TypeScript Development

## Purpose

Help engineers use TypeScript as a design tool, not only syntax checking. Favor precise domain types, stable module boundaries, and readable control flow.

## Workflow

1. Inspect `tsconfig`, package manager, framework, and existing lint/test commands.
2. Model external input as unknown until validated.
3. Use discriminated unions, branded IDs, and typed results where they clarify behavior.
4. Avoid excessive generics and type gymnastics when plain types are clearer.
5. Verify with typecheck, tests, and build where available.

## Checklist

- `strict`, `noUncheckedIndexedAccess`, and module resolution behavior.
- Runtime validation for API, env, file, and database input.
- ESM/CJS compatibility and bundler assumptions.
- Public API surface and generated types.
- Error typing, nullability, and async result flow.

## Output

Return:

- Type-safety improvements.
- Runtime contract changes.
- Verification commands.
- Migration notes if public types change.
