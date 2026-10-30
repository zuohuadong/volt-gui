<script lang="ts">
  import { Monitor, Moon, Sun } from "@lucide/svelte";
  import { setMode, userPrefersMode } from "mode-watcher";
  import { Button } from "$components/ui/button";
  import { t } from "$lib/i18n";

  const options = [
    { value: "light", icon: Sun, label: "app.themeLight" },
    { value: "dark", icon: Moon, label: "app.themeDark" },
    { value: "system", icon: Monitor, label: "app.themeSystem" },
  ] as const;
</script>

<div class="theme-selector" role="group" aria-label={t("app.theme")}>
  {#each options as option (option.value)}
    <Button
      variant="ghost"
      size="icon-sm"
      class="topbar-action-btn topbar-icon-btn"
      aria-label={t(option.label)}
      title={t(option.label)}
      aria-pressed={userPrefersMode.current === option.value}
      onclick={() => setMode(option.value)}
    >
      <option.icon size={14} />
    </Button>
  {/each}
</div>
