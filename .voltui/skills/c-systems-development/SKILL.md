---
name: c-systems-development
description: Develop, review, debug, and optimize C/C++ systems code. Use for embedded software, Linux services, native libraries, memory safety, concurrency, performance, build systems, and hardware-facing code.
---

# C Systems Development

## Purpose

Help engineers work on C and C++ code with attention to correctness, memory safety, portability, and hardware constraints.

## Workflow

1. Identify target platform, compiler, standard version, build system, and runtime constraints.
2. Inspect ownership, lifetime, allocation, error handling, thread-safety, and ABI boundaries.
3. Prefer simple data structures and explicit ownership over hidden global state.
4. For bugs, produce a minimal reproduction or targeted test before large refactors.
5. For performance, measure first and distinguish algorithmic cost from cache, allocation, syscall, and synchronization costs.

## Checklist

- Bounds checks, integer overflow, signed/unsigned conversions.
- Null handling and cleanup on all error paths.
- Race conditions, lock ordering, atomics, and memory barriers.
- Undefined behavior, strict aliasing, alignment, and lifetime.
- Sanitizers: ASan, UBSan, TSan, MSan where applicable.
- Build flags, warnings, static analysis, and cross-compilation.

## Output

Return findings or changes with:

- Risk summary.
- Exact files/functions when available.
- Tests or commands to verify.
- Remaining assumptions.
