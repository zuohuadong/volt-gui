<script lang="ts">
  import { ShieldCheck } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import type { DshClient, PermissionSelect } from "$lib/dsh-client";

  let { client, sessionId, permissions, onNotice }: { client: DshClient; sessionId: string; permissions?: PermissionSelect; onNotice?: (message: string) => void } = $props();
  let preset = $derived(permissions?.currentValue === "custom" ? "custom" : permissions?.currentValue || "workspace-write");
  let busy = $state(false);
  let confirmFull = $state(false);
  const options = $derived(permissions?.options?.length ? permissions.options : [
    { value: "workspace-write", label: "工作区可写" },
    { value: "danger-full-access", label: "完全访问" },
  ]);

  async function apply(): Promise<void> {
    if (preset === "danger-full-access" && !confirmFull) { confirmFull = true; return; }
    busy = true;
    try {
      const result = await client.prompt(sessionId, `/permission ${preset}`);
      onNotice?.(result.command?.text || `权限预设已切换为 ${preset}`);
      confirmFull = false;
    } catch (error) { onNotice?.(error instanceof Error ? error.message : String(error)); }
    finally { busy = false; }
  }
</script>

<div class="permission-selector">
  <ShieldCheck size={14} />
  <select aria-label="权限预设" bind:value={preset} disabled={busy}>{#each options as option (option.value)}<option value={option.value} disabled={option.value === "custom"}>{option.label || option.value}</option>{/each}</select>
  {#if confirmFull}<span class="permission-warning">完全访问会跳过沙箱确认</span><Button variant="destructive" size="xs" disabled={busy} onclick={() => void apply()}>确认</Button><Button variant="ghost" size="xs" onclick={() => confirmFull = false}>取消</Button>{:else}<Button variant="ghost" size="xs" disabled={busy} onclick={() => void apply()}>应用</Button>{/if}
</div>
