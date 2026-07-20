<script lang="ts">
  import { ShieldCheck, Trash2 } from "@lucide/svelte";

  let {
    serverName,
    trustedTools = [],
    availableTools = [],
    busy = false,
    onTrust,
    onUntrust,
  }: {
    serverName: string;
    trustedTools?: string[];
    availableTools?: { name: string; description: string; readOnlyHint?: boolean }[];
    busy?: boolean;
    onTrust: (toolName: string) => void | Promise<void>;
    onUntrust: (toolName: string) => void | Promise<void>;
  } = $props();

  let toolName = $state("");
  const eligibleTools = $derived(availableTools.filter((tool) => tool.readOnlyHint && !trustedTools.includes(tool.name)));

  async function trustTool() {
    const normalizedName = toolName.trim();
    if (!normalizedName || busy) return;
    await onTrust(normalizedName);
    toolName = "";
  }
</script>

<section class="mcp-trust" aria-label={`${serverName} MCP 只读信任工具`}>
  <header><ShieldCheck size={16} /><div><strong>只读工具信任</strong><p>仅可选择当前服务已声明为只读的工具；名称和元数据会在保存前由桌面后端再次核验。</p></div></header>
  {#if eligibleTools.length > 0}
    <div class="mcp-trust__add">
      <select bind:value={toolName} aria-label="已声明只读的 MCP 工具">
        <option value="">选择已声明只读的工具</option>
        {#each eligibleTools as tool (tool.name)}
          <option value={tool.name}>{tool.name}{tool.description ? ` — ${tool.description}` : ""}</option>
        {/each}
      </select>
      <button type="button" disabled={busy || !toolName} onclick={() => void trustTool()}>加入信任</button>
    </div>
  {:else}
    <p class="mcp-trust__empty">当前服务未声明可安全授信的只读工具。请先重新连接并确认服务端工具元数据。</p>
  {/if}
  <div class="mcp-trust__list">
    {#each trustedTools as trustedTool (trustedTool)}
      <article><code>{trustedTool}</code><button type="button" disabled={busy} aria-label={`撤销 ${trustedTool} 的信任`} onclick={() => void onUntrust(trustedTool)}><Trash2 size={13} /> 撤销</button></article>
    {:else}
      <p class="mcp-trust__empty">暂无只读信任工具。未列入的工具在计划模式中仍需审批。</p>
    {/each}
  </div>
</section>

<style>
  .mcp-trust { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--border, #dce1db); border-radius: 10px; background: var(--surface, #fff); }
  header { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 8px; color: var(--primary, #0f7b55); }
  header strong { display: block; color: var(--fg, #1f2421); font-size: 12px; }
  header p, .mcp-trust__empty { margin: 3px 0 0; color: var(--fg-muted, #687169); font-size: 11px; line-height: 1.5; }
  .mcp-trust__add { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; }
  select, button { min-height: 34px; padding: 0 9px; color: var(--fg, #1f2421); background: var(--surface, #fff); border: 1px solid var(--border, #dce1db); border-radius: 7px; font: inherit; }
  button { cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .52; }
  .mcp-trust__list { display: grid; gap: 6px; }
  article { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 36px; padding: 0 8px 0 10px; background: var(--surface-muted, #edf0ec); border-radius: 7px; }
  article code { overflow-wrap: anywhere; color: var(--fg, #1f2421); font-size: 11px; }
  article button { display: inline-flex; align-items: center; gap: 5px; min-height: 28px; color: var(--danger, #b42318); font-size: 10px; }

  @media (max-width: 560px) {
    .mcp-trust__add { grid-template-columns: 1fr; }
  }
</style>
