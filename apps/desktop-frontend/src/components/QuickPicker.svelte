<script lang="ts">
  import { History, Settings2, Sparkles } from "@lucide/svelte";
  import { t } from "$lib/i18n";

  export type QuickPickerItem = {
    id: string;
    kind: "session" | "action";
    title: string;
    detail?: string;
    sessionId?: string;
    run?: () => void;
  };

  let {
    open,
    query,
    items,
    selectedIndex,
    activeSessionId = "",
    onQuery,
    onSelect,
    onClose,
  }: {
    open: boolean;
    query: string;
    items: QuickPickerItem[];
    selectedIndex: number;
    activeSessionId?: string;
    onQuery: (value: string) => void;
    onSelect: (item: QuickPickerItem) => void;
    onClose: () => void;
  } = $props();

  let input = $state<HTMLInputElement>();
  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    void Promise.resolve().then(() => input?.focus());
    return () => { if (dialog?.open) dialog.close(); };
  });
</script>

{#if open}
    <dialog
      bind:this={dialog}
      class="quick-picker"
      aria-label={t("quickPicker.title")}
      onclose={onClose}
      oncancel={(event) => { event.preventDefault(); onClose(); }}
      onclick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div class="quick-picker__search">
        <Sparkles size={15} aria-hidden="true" />
        <input
          bind:this={input}
          value={query}
          oninput={(event) => onQuery(event.currentTarget.value)}
          placeholder={t("quickPicker.placeholder")}
          aria-label={t("quickPicker.placeholder")}
          autocomplete="off"
          spellcheck="false"
        />
        <kbd>Esc</kbd>
      </div>
      <div class="quick-picker__list" role="listbox" aria-label={t("quickPicker.title")}>
        {#each items as item, index (item.id)}
          <button
            type="button"
            role="option"
            aria-selected={index === selectedIndex}
            class:chosen={index === selectedIndex}
            class:current={item.kind === "session" && item.sessionId === activeSessionId}
            onclick={() => onSelect(item)}
          >
            <span class="quick-picker__icon">{#if item.kind === "session"}<History size={15} />{:else}<Settings2 size={15} />{/if}</span>
            <span class="quick-picker__copy">
              <strong>{item.title}</strong>
              {#if item.detail}<small>{item.detail}</small>{/if}
            </span>
            {#if item.kind === "session" && item.sessionId === activeSessionId}<span class="quick-picker__badge">{t("quickPicker.current")}</span>{/if}
          </button>
        {:else}
          <p class="quick-picker__empty">{t("quickPicker.empty")}</p>
        {/each}
      </div>
      <footer class="quick-picker__footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> {t("quickPicker.navigate")}</span>
        <span><kbd>Enter</kbd> {t("quickPicker.open")}</span>
        <span><kbd>Esc</kbd> {t("quickPicker.close")}</span>
      </footer>
    </dialog>
{/if}

<style>
  .quick-picker { position: fixed; inset: min(12vh, 110px) 20px auto; width: min(640px, calc(100vw - 40px)); max-height: min(70vh, 620px); margin: 0 auto; padding: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border); border-radius: 10px; background: var(--background); color: var(--foreground); box-shadow: 0 18px 60px rgb(0 0 0 / 24%); }
  .quick-picker::backdrop { background: color-mix(in oklch, black 26%, transparent); backdrop-filter: blur(2px); }
  .quick-picker__search { display: flex; align-items: center; gap: 9px; padding: 12px 14px; border-bottom: 1px solid var(--border); color: var(--muted-foreground); }
  .quick-picker__search input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--foreground); font-size: 14px; }
  .quick-picker__list { min-height: 0; overflow: auto; padding: 6px; }
  .quick-picker__list button { display: flex; width: 100%; align-items: center; gap: 10px; padding: 9px 10px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--foreground); text-align: left; cursor: pointer; }
  .quick-picker__list button.chosen { border-color: color-mix(in oklch, var(--primary) 22%, var(--border)); background: color-mix(in oklch, var(--primary) 8%, var(--card)); }
  .quick-picker__list button.current .quick-picker__copy strong { color: var(--primary); }
  .quick-picker__icon { display: grid; width: 24px; height: 24px; flex: 0 0 auto; place-items: center; border-radius: 6px; background: var(--muted); color: var(--muted-foreground); }
  .quick-picker__copy { min-width: 0; flex: 1; }
  .quick-picker__copy strong, .quick-picker__copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .quick-picker__copy strong { font-size: 12.5px; font-weight: 600; }
  .quick-picker__copy small { margin-top: 2px; color: var(--muted-foreground); font-size: 11px; }
  .quick-picker__badge { flex: 0 0 auto; padding: 2px 6px; border-radius: 999px; background: var(--muted); color: var(--muted-foreground); font-size: 10px; }
  .quick-picker__empty { margin: 0; padding: 24px 12px; color: var(--muted-foreground); text-align: center; font-size: 12px; }
  .quick-picker__footer { display: flex; flex-wrap: wrap; gap: 14px; padding: 9px 14px; border-top: 1px solid var(--border); color: var(--muted-foreground); font-size: 10.5px; }
  .quick-picker__footer kbd, .quick-picker__search kbd { padding: 1px 5px; border: 1px solid var(--border); border-radius: 4px; background: var(--muted); font: inherit; font-size: 10px; }
</style>