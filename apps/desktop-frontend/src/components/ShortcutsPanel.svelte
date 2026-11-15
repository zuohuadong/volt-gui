<script lang="ts">
  import { ChevronRight, X } from "@lucide/svelte";
  import { tick } from "svelte";
  import { t } from "$lib/i18n";

  interface Props {
    readonly open: boolean;
    readonly onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let dialog = $state<HTMLDivElement>();

  // 面板由快捷跳板打开时焦点仍在输入框：必须自己接管，否则 Escape 会冒泡到
  // 全局处理并取消正在执行的任务。
  $effect(() => {
    if (!open) return;
    void tick().then(() => dialog?.focus());
  });

  // 只列出本应用真实绑定的快捷键（见 App.handleGlobalKeydown 与
  // lib/session-navigation.ts）。计划中的绑定不写在这里，避免"文档支持、实际没绑"。
  type Row = { keys: string[]; label: string };
  const groups = $derived<Array<{ title: string; rows: Row[] }>>([
    {
      title: t("shortcuts.groupNavigation"),
      rows: [
        { keys: [t("shortcuts.mod"), "K"], label: t("shortcuts.commandPalette") },
        { keys: [t("shortcuts.mod"), "Shift", "P"], label: t("shortcuts.commandPalette") },
        { keys: [t("shortcuts.mod"), "N"], label: t("shortcuts.newSession") },
        { keys: [t("shortcuts.mod"), "B"], label: t("shortcuts.toggleSidebar") },
      ],
    },
    {
      title: t("shortcuts.groupSessions"),
      rows: [
        { keys: ["Alt", "↑"], label: t("shortcuts.previousSession") },
        { keys: ["Alt", "↓"], label: t("shortcuts.nextSession") },
        { keys: [t("shortcuts.mod"), "Shift", "["], label: t("shortcuts.previousSession") },
        { keys: [t("shortcuts.mod"), "Shift", "]"], label: t("shortcuts.nextSession") },
      ],
    },
    {
      title: t("shortcuts.groupConversation"),
      rows: [
        { keys: [t("shortcuts.mod"), "Home"], label: t("shortcuts.historyTop") },
        { keys: [t("shortcuts.mod"), "End"], label: t("shortcuts.historyBottom") },
        { keys: [t("shortcuts.mod"), "Enter"], label: t("shortcuts.sendMessage") },
        { keys: ["Enter"], label: t("shortcuts.queueWhileRunning") },
        { keys: ["Esc"], label: t("shortcuts.stopOrClose") },
      ],
    },
  ]);

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }
</script>

{#if open}
  <div class="shortcut-backdrop" role="presentation" onclick={onClose}></div>
  <div bind:this={dialog} class="shortcut-dialog" role="dialog" aria-modal="true" aria-label={t("shortcuts.title")} tabindex="-1" onkeydown={onKeydown}>
    <header>
      <strong>{t("shortcuts.title")}</strong>
      <button type="button" aria-label={t("common.close")} onclick={onClose}><X size={14} /></button>
    </header>
    {#each groups as group (group.title)}
      <div class="shortcut-group">
        <div class="section-label">{group.title}</div>
        <ul>
          {#each group.rows as row (row.label + row.keys.join("+"))}
            <li>
              <span>{row.label}</span>
              <span class="shortcut-keys">
                {#each row.keys as key, index (key + index)}
                  {#if index > 0}<ChevronRight size={10} aria-hidden="true" />{/if}
                  <kbd>{key}</kbd>
                {/each}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>
{/if}

<style>
  .shortcut-backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 35%); z-index: 60; }
  .shortcut-dialog { position: fixed; top: 12vh; left: 50%; transform: translateX(-50%); width: min(520px, 92vw); max-height: 70vh; overflow: auto; z-index: 61; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--popover, var(--background)); box-shadow: 0 12px 32px rgb(0 0 0 / 18%); }
  .shortcut-dialog > header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .shortcut-dialog > header button { display: inline-flex; padding: 2px; border: 0; background: none; color: var(--muted-foreground); cursor: pointer; }
  .shortcut-group { margin-bottom: 12px; }
  .shortcut-group ul { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 4px; }
  .shortcut-group li { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12.5px; }
  .shortcut-keys { display: inline-flex; align-items: center; gap: 2px; color: var(--muted-foreground); }
  kbd { padding: 1px 6px; border: 1px solid var(--border); border-radius: 4px; font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; }
</style>