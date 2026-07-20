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

<details class="mcp-trust">
  <summary>
    <ShieldCheck size={16} />
    <span><strong>高级：只读工具信任</strong><small>{trustedTools.length > 0 ? `${trustedTools.length} 项已信任` : "默认逐次审批"}</small></span>
  </summary>
  <div class="mcp-trust__body" aria-label={`${serverName} MCP 只读信任工具`}>
    <p>只有服务明确声明为只读的工具才能加入信任；其他工具仍按当前审批模式处理。</p>
    {#if eligibleTools.length > 0}
      <div class="mcp-trust__add">
        <select bind:value={toolName} aria-label="已声明只读的 MCP 工具">
          <option value="">选择只读工具</option>
          {#each eligibleTools as tool (tool.name)}
            <option value={tool.name}>{tool.name}{tool.description ? ` — ${tool.description}` : ""}</option>
          {/each}
        </select>
        <button type="button" disabled={busy || !toolName} onclick={() => void trustTool()}>加入信任</button>
      </div>
    {/if}
    <div class="mcp-trust__list">
      {#each trustedTools as trustedTool (trustedTool)}
        <article><code>{trustedTool}</code><button type="button" disabled={busy} aria-label={`撤销 ${trustedTool} 的信任`} onclick={() => void onUntrust(trustedTool)}><Trash2 size={13} /> 撤销</button></article>
      {:else}
        {#if eligibleTools.length === 0}<p class="mcp-trust__empty">当前没有可加入信任的只读工具。</p>{/if}
      {/each}
    </div>
  </div>
</details>

<style>
  .mcp-trust { border: 1px solid var(--border, #dce1db); border-radius: 10px; background: var(--card, #fff); }
  summary { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 8px; padding: 11px 12px; cursor: pointer; color: var(--muted-foreground, #687169); list-style-position: inside; }
  summary span { display: inline-grid; gap: 2px; }
  summary strong { color: var(--foreground, #1f2421); font-size: 12px; }
  summary small { color: var(--muted-foreground, #687169); font-size: 10px; font-weight: 450; }
  summary:focus-visible, button:focus-visible, select:focus-visible { outline: 2px solid var(--accent, #0f7b55); outline-offset: 2px; }
  .mcp-trust__body { display: grid; gap: 10px; padding: 0 12px 12px; border-top: 1px solid var(--border, #dce1db); }
  .mcp-trust__body > p, .mcp-trust__empty { margin: 10px 0 0; color: var(--muted-foreground, #687169); font-size: 11px; line-height: 1.5; }
  .mcp-trust__add { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; }
  select, button { min-height: 34px; padding: 0 9px; color: var(--foreground, #1f2421); background: var(--card, #fff); border: 1px solid var(--border, #dce1db); border-radius: 7px; font: inherit; }
  button { cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .52; }
  .mcp-trust__list { display: grid; gap: 6px; }
  article { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 36px; padding: 0 8px 0 10px; background: var(--muted, #edf0ec); border-radius: 7px; }
  article code { overflow-wrap: anywhere; color: var(--foreground, #1f2421); font-size: 11px; }
  article button { display: inline-flex; align-items: center; gap: 5px; min-height: 28px; color: var(--destructive, #b42318); font-size: 10px; }

  @media (max-width: 560px) {
    .mcp-trust__add { grid-template-columns: 1fr; }
  }
</style>
