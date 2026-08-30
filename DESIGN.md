# Volt GUI Design Boundary

## Product Surface

The official DeepSeek Harness runtime remains the source of truth for sessions,
tools, permissions, credentials, and persistence. VoltUI owns a thin local
Svelte 5 workbench for presentation and management views, using the official
loopback RPC/event APIs rather than reimplementing runtime state.

## Electron Shell

Electron owns only native desktop concerns:

- window creation and single-instance behavior;
- loopback-only access to the managed DSH runtime APIs;
- sandbox, context isolation, browser permission denial, and external-window denial;
- DSH child-process startup, shutdown, crash handling, and packaging;
- product name, application identifier, executable name, and installer metadata.

The shell exposes only a narrow preload API for window controls, workspace
selection, runtime bootstrap, and runtime-error reporting. It must not duplicate
DSH persistence or run a second backend. Startup failure is rendered inside the
workbench so the app does not produce an unsolicited blocking error popup.

## DSH Extensions

Product behavior and UI customization use official DSH RPC/event APIs and
supported profile or plugin extension points. `profiles/anyong.yml` may override
rows supplied by the official profile; it must not recreate official plugins or
private runtime state.

When the official APIs cannot express a requested runtime capability, treat that
as an upstream DSH requirement. Do not copy official renderer assets or create a
parallel Harness backend in this repository.

## Site

The Astro site documents the current architecture and supported release scope.
It must not advertise retired services, packages, account flows, community
features, or release channels.

## Verification

For presentation or shell changes, verify the official DSH runtime APIs and the
Electron window. The local renderer must use real loopback session, history,
prompt, model, and workspace flows; a mock page or parallel persistence layer is
not acceptance evidence.
