---
name: anyong-brand-config
description: Use when configuring, verifying, or debugging the 暗涌 (Anyong/Xigu AI) white-label branding on the VoltUI fork. Covers BrandConfig env vars, voltui.toml [brand] section, desktop-build.sh VOLTUI_BRAND_NAME, and GitHub Actions/CNB release naming.
---

# 暗涌 Brand Configuration

This skill ensures agents use the **configuration-driven** branding system instead of hardcoding brand names in source code. The upstream VoltUI project provides a complete BrandConfig mechanism — 暗涌 is a downstream fork that uses it rather than modifying source files.

## Core Rule: Never Hardcode Brand Names in Source Code

**Forbidden**: Replacing `VoltUI` with `暗涌` in `.go`, `.ts`, `.tsx`, `.json`, `.html`, `.css`, `.md` (except CI config files).

**Required**: Use the BrandConfig system to apply 暗涌 branding without touching source code.

## BrandConfig Mechanism (3 Layers)

Priority order: env var > config file > compiled default.

### Layer 1: Environment Variables

| Variable | Maps to | Default |
|---|---|---|
| `VOLTUI_BRAND_NAME` | `brand.name` | `VoltUI` |
| `VOLTUI_BRAND_SHORT_NAME` | `brand.short_name` | (falls back to `brand.name`) |
| `VOLTUI_BRAND_LOGO` | `brand.logo_path` | (built-in SVG) |
| `VOLTUI_BRAND_WORDMARK` | `brand.wordmark_path` | (built-in SVG) |
| `VOLTUI_BRAND_ICON` | `brand.icon_path` | (built-in PNG/ICO) |

For 暗涌, set in runtime:
```bash
export VOLTUI_BRAND_NAME="暗涌"
```

### Layer 2: voltui.toml `[brand]` Section

```toml
[brand]
name = "暗涌"
short_name = "暗涌"
# logo_path and wordmark_path can point to custom SVG/PNG files
# icon_path can point to custom ICO/PNG for tray/taskbar
```

Resolution: `internal/config/config.go` — `BrandName()`, `BrandShortName()`, `BrandLogoPath()`, etc.

### Layer 3: Compiled Defaults

Source code uses `"VoltUI"` as the compiled-in default. This is intentional — it allows any fork to override via config/env without rebuilding.

The system prompt auto-replacement works as:
```go
// ResolveSystemPrompt replaces "VoltUI" placeholder with configured brand name
brandName := c.BrandName()
if brandName != "VoltUI" {
    prompt = strings.ReplaceAll(prompt, "VoltUI", brandName)
}
```

## Desktop Build Branding

`scripts/desktop-build.sh` uses `VOLTUI_BRAND_NAME` for artifact naming:
```bash
BRAND="${VOLTUI_BRAND_NAME:-VoltUI}"
# Output: 暗涌-darwin-universal.zip, 暗涌-windows-amd64-installer.exe, etc.
```

For CNB CI (`\.cnb.yml`), set `XIGU_BRAND_NAME` env var:
```yaml
env:
  XIGU_BRAND_NAME: "暗涌"
```

## Frontend Branding

`desktop/frontend/src/lib/brand.tsx` provides `BrandProvider` React context:
- Reads brand info from Go kernel via `app.Brand()` bridge call
- All components should use `useBrand()` instead of hardcoding names
- The `defaultBrand` fallback uses `"VoltUI"` — this is correct and should NOT be changed

## Verification Checklist

When checking if branding is correctly configured:

1. ✅ Source code still says `"VoltUI"` as default — correct
2. ✅ `.cnb.yml` sets `XIGU_BRAND_NAME: "暗涌"` — correct
3. ✅ `desktop-build.sh` uses `VOLTUI_BRAND_NAME` env var — correct
4. ✅ No `暗涌` appears in `.go`, `.ts`, `.tsx` source files — correct
5. ✅ `BrandConfig.Name` default in `config.go` is `"VoltUI"` — correct

## Anti-patterns

| Anti-pattern | Why it's wrong | Correct approach |
|---|---|---|
| `sed -i 's/VoltUI/暗涌/g' *.go` | Breaks upstream sync, makes 65+ file diffs | Set `VOLTUI_BRAND_NAME=暗涌` |
| Changing `BrandConfig{Name: "VoltUI"}` default | Breaks the whole BrandConfig fallback chain | Use env vars or voltui.toml |
| Editing `brand.tsx` defaultBrand.name | Breaks runtime brand resolution | Go kernel serves brand info at runtime |

## Directive

All branding customizations in this fork must be configuration-only (env vars, config files, CI settings). Source code must remain identical to upstream for seamless sync.