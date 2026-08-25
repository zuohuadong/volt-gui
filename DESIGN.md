# Volt GUI Design Boundary

## Product Surface

The official DeepSeek Harness Web UI is the only desktop product surface. This
repository does not own a renderer, component library, theme layer, or parallel
workbench implementation.

## Electron Shell

Electron owns only native desktop concerns:

- window creation and single-instance behavior;
- loopback-only navigation to the managed DSH Web process;
- sandbox, context isolation, browser permission denial, and external-window denial;
- DSH child-process startup, shutdown, crash handling, and packaging;
- product name, application identifier, executable name, and installer metadata.

The shell must not expose a preload API, duplicate DSH persistence, or render a
fallback application. Startup failure is an explicit native error, not a second
product surface.

## DSH Extensions

Product behavior and UI customization must use supported official DSH profile
or plugin extension points. `profiles/anyong.yml` may override rows supplied by
the official profile; it must not recreate official plugins or private runtime
state.

When the official extension model cannot express a requested UI change, treat
that as an upstream DSH requirement. Do not copy the official renderer into this
repository.

## Site

The Astro site documents the current architecture and supported release scope.
It must not advertise retired services, packages, account flows, community
features, or release channels.

## Verification

For presentation or shell changes, verify the real official DSH Web surface and
the Electron window. A mock page, copied renderer, static HTML fallback, or a
successful process launch without a usable UI is not acceptance evidence.
