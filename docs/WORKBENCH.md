# Workbench

The desktop workbench is a local Svelte 5 renderer hosted inside a hardened Electron window. It uses shadcn-svelte for focused controls and svadmin for resource-oriented management views.

Electron starts the official web profile, waits for a trusted `dsh web:` loopback URL, and exposes only an allowlisted RPC/event bridge through the isolated preload. The renderer does not mirror DSH persistence or implement a second agent engine, so session, tool, approval, and credential behavior remains owned by the official runtime.

The profile overlay in `profiles/anyong.yml` contains only product defaults. Missing runtime capabilities should be implemented as official DSH profile/plugin configuration or upstream contributions, not as private engine code in this repository.
