<script lang="ts">
  import { ShieldCheck } from "@lucide/svelte";
  import {
    PromptInputButton,
    PromptInputSelect,
    PromptInputSelectContent,
    PromptInputSelectItem,
    PromptInputSelectTrigger,
    PromptInputSelectValue,
  } from "@svadmin/ai-elements";
import { Button } from "$components/ui/button";
import type { DshClient, PermissionSelect } from "$lib/dsh-client";
import { t } from "$lib/i18n";

interface Props {
    readonly client: DshClient;
    readonly sessionId: string;
    readonly permissions?: PermissionSelect;
    readonly onNotice?: (message: string) => void;
  }

  let { client, sessionId, permissions, onNotice }: Props = $props();
  let preset = $derived(permissions?.currentValue === "custom" ? "custom" : permissions?.currentValue || "workspace-write");
  let selectedPreset = $state("");
  let busy = $state(false);
  let confirmFull = $state(false);
  let confirmSessionId = $state("");
  const options = $derived(permissions?.options?.length ? permissions.options : [
    { value: "workspace-write", label: t("composer.permissionWrite") },
    { value: "danger-full-access", label: t("composer.permissionFull") },
  ]);
  const activePreset = $derived(selectedPreset || preset);

  $effect(() => {
    sessionId;
    selectedPreset = "";
    confirmFull = false;
    confirmSessionId = "";
  });

  async function apply(nextPreset: string): Promise<void> {
    if (!nextPreset || nextPreset === "custom" || nextPreset === preset) return;
    selectedPreset = nextPreset;
    if (nextPreset === "danger-full-access" && !confirmFull) {
      confirmFull = true;
      confirmSessionId = sessionId;
      return;
    }
    busy = true;
    try {
      const result = await client.prompt(sessionId, `/permission ${nextPreset}`);
      onNotice?.(result.command?.text || t("composer.permissionChanged", { preset: nextPreset }));
      selectedPreset = "";
      confirmFull = false;
      confirmSessionId = "";
    } catch (error) {
      selectedPreset = "";
      confirmFull = false;
      confirmSessionId = "";
      onNotice?.(error instanceof Error ? error.message : String(error));
    } finally {
      busy = false;
    }
  }
</script>

<div class="permission-selector">
  <PromptInputSelect value={activePreset} onvaluechange={(value) => void apply(value)}>
    <PromptInputSelectTrigger aria-label={t("composer.permission")} disabled={busy} title={t("composer.permission")} class="permission-selector-trigger">
      <ShieldCheck size={14} class="text-primary flex-shrink-0" />
      <PromptInputSelectValue>
        {#snippet children(value)}
          <span class="permission-label">{options.find((option) => option.value === value)?.label || value}</span>
        {/snippet}
      </PromptInputSelectValue>
    </PromptInputSelectTrigger>
    <PromptInputSelectContent class="permission-selector-content">
      {#each options as option (option.value)}
        <PromptInputSelectItem value={option.value} disabled={option.value === "custom"}>
          <span class="permission-item-label">{option.label || option.value}</span>
        </PromptInputSelectItem>
      {/each}
    </PromptInputSelectContent>
  </PromptInputSelect>
  {#if confirmFull}
    <div class="permission-confirm-inline">
      <span class="permission-warning">{t("common.warning")}</span>
      <Button variant="destructive" size="xs" disabled={busy || confirmSessionId !== sessionId} onclick={() => void apply("danger-full-access")}>{t("common.confirm")}</Button>
      <PromptInputButton aria-label={t("common.cancel")} disabled={busy} onclick={() => { selectedPreset = ""; confirmFull = false; confirmSessionId = ""; }}>{t("common.cancel")}</PromptInputButton>
    </div>
  {/if}
</div>
