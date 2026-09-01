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
  const options = $derived(permissions?.options?.length ? permissions.options : [
    { value: "workspace-write", label: "工作区可写" },
    { value: "danger-full-access", label: "完全访问" },
  ]);
  const activePreset = $derived(selectedPreset || preset);

  async function apply(nextPreset: string): Promise<void> {
    if (!nextPreset || nextPreset === "custom" || nextPreset === preset) return;
    selectedPreset = nextPreset;
    if (nextPreset === "danger-full-access" && !confirmFull) {
      confirmFull = true;
      return;
    }
    busy = true;
    try {
      const result = await client.prompt(sessionId, `/permission ${nextPreset}`);
      onNotice?.(result.command?.text || `权限预设已切换为 ${nextPreset}`);
      selectedPreset = "";
      confirmFull = false;
    } catch (error) {
      selectedPreset = "";
      confirmFull = false;
      onNotice?.(error instanceof Error ? error.message : String(error));
    } finally {
      busy = false;
    }
  }
</script>

<div class="permission-selector">
  <PromptInputSelect value={activePreset} onvaluechange={(value) => void apply(value)}>
    <PromptInputSelectTrigger aria-label="权限预设" disabled={busy}>
      <ShieldCheck size={14} />
      <PromptInputSelectValue>
        {#snippet children(value)}
          {options.find((option) => option.value === value)?.label || value}
        {/snippet}
      </PromptInputSelectValue>
    </PromptInputSelectTrigger>
    <PromptInputSelectContent>
      {#each options as option (option.value)}
        <PromptInputSelectItem value={option.value} disabled={option.value === "custom"}>{option.label || option.value}</PromptInputSelectItem>
      {/each}
    </PromptInputSelectContent>
  </PromptInputSelect>
  {#if confirmFull}
    <span class="permission-warning">完全访问会跳过沙箱确认</span>
    <Button variant="destructive" size="xs" disabled={busy} onclick={() => void apply("danger-full-access")}>确认</Button>
    <PromptInputButton aria-label="取消完全访问" disabled={busy} onclick={() => { selectedPreset = ""; confirmFull = false; }}>取消</PromptInputButton>
  {/if}
</div>
