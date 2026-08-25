# Workbench

The desktop workbench is the official DSH web UI hosted inside a hardened Electron window.

Electron starts the web profile and waits for a trusted `dsh web:` loopback URL. It does not render a second local UI, proxy session APIs, or mirror DSH persistence. This keeps session, tool, approval and credential behavior aligned with the official runtime.

The profile overlay in `profiles/anyong.yml` contains only product defaults. New capabilities should be implemented as official DSH profile/plugin configuration or upstream contributions, not as private engine code in this repository.
