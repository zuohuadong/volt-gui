# Product Requirements

## Product

VoltUI provides a local, inspectable Electron desktop experience for the official DeepSeek Harness runtime.

## Goals

- Start the latest pinned official DSH web profile in a managed child process.
- Keep the Electron security and lifecycle boundary minimal and testable.
- Preserve official DSH ownership of sessions, tools, permissions, credentials and storage.
- Ship a reproducible Node 26 workspace and Windows x64 review artifact.
- Document the real runtime contract without legacy compatibility promises.

## Non-goals

- A second agent engine or private fork of DSH internals.
- A native CLI/TUI distribution line.
- A second desktop runtime.
- Upstream synchronization, multi-channel legacy release tags or automatic signing.
- Centralized cloud control-plane features.

## Acceptance

1. `@deepseek-ai/dsh` is pinned to the current verified npm `latest` version in package manifests and lockfile.
2. Electron starts `dsh web --patch profiles/anyong.yml --host 127.0.0.1 --port 0 --no-open` and accepts only the published loopback URL.
3. Packaged builds resolve DSH from `app.asar.unpacked` and include the profile patch.
4. CI uses Node `26.7.0` and pnpm `11.23.0`, with no retired runtime jobs.
5. Migration, security, DSH integration, package, build and site smoke gates pass on the same commit.
