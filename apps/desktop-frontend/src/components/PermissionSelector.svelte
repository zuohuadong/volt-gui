<script lang="ts">
  import { AlertTriangle, Check, ChevronDown, Lock, ShieldAlert, ShieldCheck } from "lucide-svelte";
  import { Button } from "$components/ui/button";
  import type { DshClient, PermissionSelect } from "$lib/dsh-client";
  import { t } from "$lib/i18n";
  import { onMount } from "svelte";

  interface Props {
    readonly client: DshClient;
    readonly sessionId: string;
    readonly permissions?: PermissionSelect;
    readonly onNotice?: (message: string) => void;
  }

  let { client, sessionId, permissions, onNotice }: Props = $props();

  let open = $state(false);
  let containerRef = $state<HTMLDivElement | null>(null);
  let preset = $derived(
    permissions?.currentValue === "custom" ? "custom" : permissions?.currentValue || "workspace-write"
  );
  let selectedPreset = $state("");
  let busy = $state(false);
  let confirmFull = $state(false);
  let confirmSessionId = $state("");

  const standardOptions = [
    {
      value: "workspace-write",
      label: t("composer.permissionWrite"),
      desc: t("composer.permissionWriteDesc"),
      icon: ShieldCheck,
      tag: t("composer.permissionRecommended"),
    },
    {
      value: "danger-full-access",
      label: t("composer.permissionFull"),
      desc: t("composer.permissionFullDesc"),
      icon: ShieldAlert,
      tag: t("composer.permissionHighRisk"),
    },
    {
      value: "read-only",
      label: t("composer.permissionReadOnly"),
      desc: t("composer.permissionReadOnlyDesc"),
      icon: Lock,
      tag: t("composer.permissionSafe"),
    },
  ];

  const activePreset = $derived(selectedPreset || preset);
  const currentOption = $derived(
    standardOptions.find((o) => o.value === activePreset) || {
      value: activePreset,
      label: permissions?.options?.find((o) => o.value === activePreset)?.label || activePreset,
      desc: "",
      icon: ShieldCheck,
      tag: "",
    }
  );

  $effect(() => {
    sessionId;
    selectedPreset = "";
    confirmFull = false;
    confirmSessionId = "";
    open = false;
  });

  async function apply(nextPreset: string): Promise<void> {
    if (!nextPreset || nextPreset === "custom" || nextPreset === preset) {
      open = false;
      return;
    }
    if (nextPreset === "danger-full-access" && !confirmFull) {
      confirmFull = true;
      confirmSessionId = sessionId;
      return;
    }
    busy = true;
    try {
      const result = await client.prompt(sessionId, `/permission ${nextPreset}`);
      onNotice?.(
        result.command?.text ||
          t("composer.permissionChanged", { preset: nextPreset })
      );
      selectedPreset = "";
      confirmFull = false;
      confirmSessionId = "";
      open = false;
    } catch (error) {
      selectedPreset = "";
      confirmFull = false;
      confirmSessionId = "";
      onNotice?.(error instanceof Error ? error.message : String(error));
    } finally {
      busy = false;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        open = true;
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      open = false;
      confirmFull = false;
    }
  }

  onMount(() => {
    function handleClickOutside(e: MouseEvent) {
      if (open && containerRef && !containerRef.contains(e.target as Node)) {
        open = false;
        confirmFull = false;
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
    };
  });
</script>

<div
  bind:this={containerRef}
  class="permission-selector-dropdown"
>
  <button
    type="button"
    class="permission-picker-trigger"
    class:active={open}
    disabled={busy || !sessionId}
    aria-haspopup="menu"
    onkeydown={handleKeyDown}
    aria-expanded={open}
    title={currentOption.label}
    onclick={() => {
      if (!busy && sessionId) open = !open;
    }}
  >
    <ShieldCheck size={14} class="permission-picker-icon" aria-hidden="true" />
    <span class="permission-picker-label">{currentOption.label}</span>
    <ChevronDown
      size={13}
      class={`permission-picker-arrow ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    />
  </button>

  {#if open}
    <div
      class="permission-picker-popover"
      role="menu"
      tabindex="-1"
      aria-label={t("composer.permission")}
      onkeydown={handleKeyDown}
    >
      <div class="permission-popover-header">
        <span>{t("composer.permission")}</span>
      </div>

      <div class="permission-options-list">
        {#each standardOptions as option (option.value)}
          {@const isSelected = activePreset === option.value}
          {@const IconComp = option.icon}
          <button
            type="button"
            role="menuitem"
            class="permission-option-item"
            class:selected={isSelected}
            class:danger={option.value === "danger-full-access"}
            onclick={() => void apply(option.value)}
          >
            <div class="permission-item-icon">
              <IconComp size={15} />
            </div>
            <div class="permission-item-copy">
              <div class="permission-item-title-row">
                <strong>{option.label}</strong>
                {#if option.tag}
                  <span
                    class={`permission-tag ${option.value === "danger-full-access" ? "danger" : option.value === "workspace-write" ? "primary" : "neutral"}`}
                  >
                    {option.tag}
                  </span>
                {/if}
              </div>
              <p>{option.desc}</p>
            </div>
            {#if isSelected}
              <Check size={14} class="permission-check-icon" />
            {/if}
          </button>
        {/each}
      </div>

      {#if confirmFull}
        <div class="permission-confirm-box">
          <div class="permission-confirm-header">
            <AlertTriangle size={14} class="text-amber-600 flex-shrink-0" />
            <strong>{t("composer.permissionConfirmFull")}</strong>
          </div>
          <p>{t("composer.permissionConfirmFullDesc")}</p>
          <div class="permission-confirm-actions">
            <Button
              variant="destructive"
              size="xs"
              disabled={busy}
              onclick={() => void apply("danger-full-access")}
            >
              {t("composer.permissionConfirmSwitch")}
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={busy}
              onclick={() => {
                confirmFull = false;
                selectedPreset = "";
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .permission-selector-dropdown {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .permission-picker-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--card);
    color: var(--foreground);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    transition: all 140ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .permission-picker-trigger:hover:not(:disabled) {
    border-color: color-mix(in oklch, var(--primary) 45%, var(--border));
    background: var(--muted);
  }

  .permission-picker-trigger.active {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px color-mix(in oklch, var(--primary) 15%, transparent);
  }

  .permission-picker-trigger:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  :global(.permission-picker-icon) {
    color: var(--primary);
    flex-shrink: 0;
  }

  .permission-picker-label {
    font-size: 12px;
    white-space: nowrap;
  }

  :global(.permission-picker-arrow) {
    color: var(--muted-foreground);
    flex-shrink: 0;
    transition: transform 140ms ease;
  }

  .permission-picker-popover {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    z-index: 70;
    display: flex;
    flex-direction: column;
    width: min(320px, calc(100vw - 32px));
    border: 1px solid var(--border);
    border-radius: 10px;
    background: #ffffff;
    color: var(--foreground);
    box-shadow: 0 12px 36px rgba(15, 23, 42, 0.12), 0 4px 12px rgba(15, 23, 42, 0.06);
    overflow: hidden;
    animation: popover-in 140ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes popover-in {
    from {
      opacity: 0;
      transform: translateY(4px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .permission-popover-header {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--background);
    font-size: 11px;
    font-weight: 600;
    color: var(--muted-foreground);
  }

  .permission-options-list {
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .permission-option-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--foreground);
    text-align: left;
    cursor: pointer;
    transition: background 100ms ease;
  }

  .permission-option-item:hover {
    background: var(--muted);
  }

  .permission-option-item.selected {
    background: color-mix(in oklch, var(--primary) 8%, var(--card));
  }

  .permission-item-icon {
    margin-top: 1px;
    color: var(--primary);
    flex-shrink: 0;
  }

  .permission-option-item.danger .permission-item-icon {
    color: #e11d48;
  }

  .permission-item-copy {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .permission-item-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .permission-item-title-row strong {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--foreground);
  }

  .permission-item-copy p {
    margin: 0;
    font-size: 11px;
    color: var(--muted-foreground);
    line-height: 1.4;
  }

  .permission-tag {
    display: inline-flex;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 500;
  }

  .permission-tag.primary {
    background: #e8f2ed;
    color: #1f5d4b;
  }

  .permission-tag.danger {
    background: #ffe4e6;
    color: #e11d48;
  }

  .permission-tag.neutral {
    background: var(--muted);
    color: var(--muted-foreground);
  }

  :global(.permission-check-icon) {
    margin-top: 2px;
    color: var(--primary);
    flex-shrink: 0;
  }

  .permission-confirm-box {
    margin: 4px 8px 8px;
    padding: 10px;
    border: 1px solid #fecdd3;
    border-radius: 6px;
    background: #fff1f2;
  }

  .permission-confirm-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }

  .permission-confirm-header strong {
    font-size: 12px;
    color: #9f1239;
  }

  .permission-confirm-box p {
    margin: 0 0 8px;
    font-size: 11px;
    color: #881337;
    line-height: 1.4;
  }

  .permission-confirm-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }
</style>
