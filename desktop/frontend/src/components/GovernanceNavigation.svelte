<script lang="ts">
  import {
    Blocks,
    Bot,
    BrainCircuit,
    ClipboardList,
    Database,
    Layers3,
    RefreshCw,
    Settings2,
    ShieldCheck,
  } from "@lucide/svelte";

  export type GovernanceLayer = "trust" | "scopedMemory" | "agents" | "capabilities" | "models" | "settings" | "sync" | "operationLog";
  export type GovernanceGroup = "agent" | "data" | "system";

  export interface GovernanceNavItem {
    id: GovernanceLayer;
    group: GovernanceGroup;
    label: string;
    desc: string;
  }

  interface Props {
    items: GovernanceNavItem[];
    activeId: GovernanceLayer;
    onSelect: (id: GovernanceLayer) => void;
  }

  let { items, activeId, onSelect }: Props = $props();

  const groups: { id: GovernanceGroup; label: string; desc: string; icon: typeof Bot }[] = [
    { id: "agent", label: "智能体配置", desc: "身份、能力与模型", icon: Bot },
    { id: "data", label: "数据治理", desc: "去向、存储与记忆", icon: ShieldCheck },
    { id: "system", label: "系统设置", desc: "运行权限与沙箱", icon: Settings2 },
  ];

  const itemIcons = {
    agents: Bot,
    capabilities: Blocks,
    models: BrainCircuit,
    trust: Database,
    scopedMemory: Layers3,
    settings: ShieldCheck,
    sync: RefreshCw,
    operationLog: ClipboardList,
  } as const;

  function selectFromDropdown(event: Event) {
    onSelect((event.currentTarget as HTMLSelectElement).value as GovernanceLayer);
  }
</script>

<nav class="governance-navigation" data-testid="governance-center" aria-label="配置与治理分类">
  <header>
    <span>配置中心</span>
    <strong>设置目录</strong>
    <p>按职责分组管理，避免同一能力在多套菜单中重复出现。</p>
  </header>

  <label class="governance-navigation__mobile-select">
    <span>当前分类</span>
    <select data-testid="governance-mobile-select" value={activeId} onchange={selectFromDropdown}>
      {#each groups as group (group.id)}
        <optgroup label={group.label}>
          {#each items.filter((item) => item.group === group.id) as item (item.id)}
            <option value={item.id}>{item.label}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
  </label>

  <div class="governance-navigation__groups">
    {#each groups as group (group.id)}
      {@const GroupIcon = group.icon}
      <section>
        <div class="governance-navigation__group-title">
          <GroupIcon size={14} />
          <span><strong>{group.label}</strong><em>{group.desc}</em></span>
        </div>
        <div class="governance-navigation__items">
          {#each items.filter((item) => item.group === group.id) as item (item.id)}
            {@const ItemIcon = itemIcons[item.id]}
            <button
              class:active={activeId === item.id}
              type="button"
              aria-pressed={activeId === item.id}
              onclick={() => onSelect(item.id)}
            >
              <ItemIcon size={15} />
              <span><strong>{item.label}</strong><em>{item.desc}</em></span>
            </button>
          {/each}
        </div>
      </section>
    {/each}
  </div>

  <footer>
    <ShieldCheck size={14} />
    <p><strong>当前 Thread 生效</strong><span>模型、权限和记忆以桌面后端返回状态为准。</span></p>
  </footer>
</nav>

<style>
  .governance-navigation {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 18px 14px 14px;
    overflow-y: auto;
    border-right: 1px solid var(--border, #dce1db);
    background: var(--muted, #edf0ec);
    color: var(--foreground, #1f2421);
  }

  header {
    padding: 0 6px 14px;
    border-bottom: 1px solid var(--border, #dce1db);
  }

  header > span {
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    font-weight: 650;
    letter-spacing: .08em;
  }

  header > strong {
    display: block;
    margin-top: 4px;
    font-size: 15px;
    font-weight: 620;
  }

  header p {
    margin: 6px 0 0;
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    line-height: 1.5;
  }

  .governance-navigation__mobile-select {
    display: none;
  }

  .governance-navigation__groups {
    display: grid;
    gap: 15px;
    padding: 15px 0;
  }

  .governance-navigation__group-title {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: start;
    padding: 0 6px 5px;
    color: var(--muted-foreground, #687169);
  }

  .governance-navigation__group-title > span,
  .governance-navigation__group-title strong,
  .governance-navigation__group-title em {
    display: block;
    min-width: 0;
  }

  .governance-navigation__group-title strong {
    color: var(--foreground, #1f2421);
    font-size: 12px;
    font-weight: 650;
  }

  .governance-navigation__group-title em {
    margin-top: 2px;
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    font-style: normal;
  }

  .governance-navigation__items {
    display: grid;
    gap: 3px;
  }

  button {
    position: relative;
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    align-items: center;
    width: 100%;
    min-height: 44px;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
    color: var(--muted-foreground, #687169);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  button:hover {
    background: var(--card, #ffffff);
  }

  button.active {
    border-color: color-mix(in srgb, var(--foreground, #1f2421) 14%, var(--border, #dce1db));
    background: color-mix(in srgb, var(--card, #ffffff) 82%, var(--foreground, #1f2421) 8%);
    color: var(--foreground, #1f2421);
  }

  button.active::before {
    position: absolute;
    top: 9px;
    bottom: 9px;
    left: -1px;
    width: 2px;
    border-radius: 2px;
    background: var(--foreground, #1f2421);
    content: "";
  }

  button > span,
  button strong,
  button em {
    display: block;
    min-width: 0;
  }

  button strong {
    overflow: hidden;
    color: inherit;
    font-size: 12px;
    font-weight: 620;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button em {
    margin-top: 2px;
    overflow: hidden;
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  footer {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 6px;
    margin-top: auto;
    padding: 11px 7px 2px;
    border-top: 1px solid var(--border, #dce1db);
    color: var(--muted-foreground, #687169);
  }

  footer p,
  footer strong,
  footer span {
    display: block;
    margin: 0;
  }

  footer strong {
    color: var(--foreground, #1f2421);
    font-size: 12px;
  }

  footer span {
    margin-top: 3px;
    font-size: 11px;
    line-height: 1.45;
  }

  @media (max-width: 820px) {
    .governance-navigation {
      display: block;
      padding: 10px 12px;
      overflow: visible;
      border-right: 0;
      border-bottom: 1px solid var(--border, #dce1db);
      background: var(--card, #ffffff);
    }

    header,
    .governance-navigation__groups,
    footer {
      display: none;
    }

    .governance-navigation__mobile-select {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 10px;
      color: var(--muted-foreground, #687169);
      font-size: 11px;
    }

    select {
      min-width: 0;
      min-height: 40px;
      padding: 0 10px;
      border: 1px solid var(--border, #dce1db);
      border-radius: 9px;
      background: var(--muted, #edf0ec);
      color: var(--foreground, #1f2421);
      font: inherit;
    }
  }

  button:focus-visible,
  select:focus-visible {
    outline: 2px solid color-mix(in srgb, #0f7b55 55%, transparent);
    outline-offset: 2px;
  }
</style>
