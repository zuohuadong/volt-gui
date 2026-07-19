<script lang="ts">
  import { Check, ChevronDown, Gauge, ListChecks, Target } from "@lucide/svelte";
  import type { CollaborationMode, TokenMode } from "../lib/types";

  let {
    open = $bindable(false),
    collaborationMode = "normal",
    tokenMode = "full",
    goal = "",
    goalStatus = "",
    changing = false,
    onCollaborationModeChange,
    onTokenModeChange,
    onGoalChange,
  }: {
    open?: boolean;
    collaborationMode?: CollaborationMode;
    tokenMode?: TokenMode;
    goal?: string;
    goalStatus?: string;
    changing?: boolean;
    onCollaborationModeChange?: (mode: CollaborationMode) => void | Promise<void>;
    onTokenModeChange?: (mode: TokenMode) => void | Promise<void>;
    onGoalChange?: (objective: string) => void | Promise<void>;
  } = $props();

  let menuRoot: HTMLDivElement | undefined;
  let triggerButton: HTMLButtonElement | undefined;
  let goalInput = $state<HTMLTextAreaElement>();
  let popoverStyle = $state("");
  let goalDraft = $derived(goal);

  const modeLabel = $derived(collaborationMode === "plan" ? "计划" : collaborationMode === "goal" ? "目标" : "标准");

  $effect(() => {
    if (open) requestAnimationFrame(positionPopover);
  });

  function positionPopover() {
    const triggerRect = triggerButton?.getBoundingClientRect();
    if (!triggerRect) return;
    const width = Math.min(360, window.innerWidth - 28);
    const height = Math.min(280, window.innerHeight - 28);
    const left = Math.max(14, Math.min(triggerRect.left, window.innerWidth - width - 14));
    const belowTop = triggerRect.bottom + 8;
    const preferredTop = window.innerHeight - belowTop >= height + 14 ? belowTop : triggerRect.top - height - 8;
    const top = Math.max(14, Math.min(preferredTop, window.innerHeight - height - 14));
    popoverStyle = `left:${left}px;top:${top}px;width:${width}px;`;
  }

  function closeOnOutsidePointer(event: PointerEvent) {
    if (!open) return;
    if (event.target instanceof Node && menuRoot?.contains(event.target)) return;
    open = false;
  }

  function closeOnEscape(event: KeyboardEvent) {
    if (!open || event.key !== "Escape") return;
    open = false;
    event.stopPropagation();
  }

  async function selectMode(mode: CollaborationMode) {
    if (changing || mode === collaborationMode) return;
    if (mode === "goal") {
      requestAnimationFrame(() => goalInput?.focus());
      return;
    }
    await onCollaborationModeChange?.(mode);
    open = false;
  }

  async function saveGoal() {
    const objective = goalDraft.trim();
    if (changing || !objective) return;
    await onGoalChange?.(objective);
    open = false;
  }

  async function clearGoal() {
    if (changing) return;
    await onGoalChange?.("");
    open = false;
  }

  function changeTokenMode(event: Event) {
    const mode = (event.currentTarget as HTMLSelectElement).value as TokenMode;
    if (mode !== tokenMode) void onTokenModeChange?.(mode);
  }
</script>

  <svelte:window onpointerdown={closeOnOutsidePointer} onkeydown={closeOnEscape} onresize={() => open && positionPopover()} />

<div class="runtime-menu" bind:this={menuRoot}>
  <button bind:this={triggerButton} class={["runtime-menu__trigger", collaborationMode !== "normal" && "active"]} type="button" aria-haspopup="dialog" aria-expanded={open} aria-busy={changing} disabled={changing} onclick={() => (open = !open)}>
    {#if collaborationMode === "plan"}<ListChecks size={14} />{:else if collaborationMode === "goal"}<Target size={14} />{:else}<Gauge size={14} />{/if}
    <span>{modeLabel}</span>
    <ChevronDown size={12} />
  </button>

  {#if open}
    <div class="runtime-menu__popover" style={popoverStyle} role="dialog" aria-label="运行方式">
      <header><div><strong>运行方式</strong><p>控制当前 Thread 如何分析、执行和收敛。</p></div><span>{goalStatus || "ready"}</span></header>
      <div class="runtime-menu__modes" role="group" aria-label="协作模式">
        <button class={{ active: collaborationMode === "normal" }} type="button" disabled={changing} onclick={() => void selectMode("normal")}><Gauge size={14} /><span><strong>标准</strong><em>直接执行当前请求</em></span>{#if collaborationMode === "normal"}<Check size={14} />{/if}</button>
        <button class={{ active: collaborationMode === "plan" }} type="button" disabled={changing} onclick={() => void selectMode("plan")}><ListChecks size={14} /><span><strong>计划</strong><em>先只读分析和规划</em></span>{#if collaborationMode === "plan"}<Check size={14} />{/if}</button>
        <button class={{ active: collaborationMode === "goal" }} type="button" disabled={changing} onclick={() => void selectMode("goal")}><Target size={14} /><span><strong>目标</strong><em>围绕长期目标持续推进</em></span>{#if collaborationMode === "goal"}<Check size={14} />{/if}</button>
      </div>

      <label>Token 档位
        <select value={tokenMode} disabled={changing} onchange={changeTokenMode}>
          <option value="full">完整能力</option>
          <option value="economy">经济模式</option>
        </select>
      </label>

      <div class="runtime-menu__goal">
        <label>长期目标<textarea bind:this={goalInput} rows="3" bind:value={goalDraft} placeholder="描述需要持续推进的具体结果"></textarea></label>
        <div><button type="button" disabled={changing || !goal} onclick={() => void clearGoal()}>清除目标</button><button class="primary" type="button" disabled={changing || !goalDraft.trim()} onclick={() => void saveGoal()}>保存目标</button></div>
      </div>
    </div>
  {/if}
</div>

<style>
  .runtime-menu { position: relative; }
  .runtime-menu__trigger { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 9px; color: var(--fg-muted, #687169); background: transparent; border: 1px solid transparent; border-radius: 7px; font-size: 12px; }
  .runtime-menu__trigger:hover, .runtime-menu__trigger.active { color: var(--primary, #0f7b55); background: var(--accent-soft, #e7f5ef); border-color: var(--border, #dce1db); }
  .runtime-menu__popover { position: fixed; z-index: 100; display: grid; gap: 12px; max-height: min(280px, calc(100vh - 28px)); overflow-y: auto; padding: 13px; color: var(--fg, #1f2421); background: var(--surface, #fff); border: 1px solid var(--border-strong, #c7cfc7); border-radius: 12px; box-shadow: 0 14px 34px rgb(31 36 33 / 14%); overscroll-behavior: contain; }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  header strong { display: block; font-size: 13px; }
  header p { margin: 3px 0 0; color: var(--fg-muted, #687169); font-size: 11px; line-height: 1.45; }
  header > span { color: var(--fg-faint, #89918b); font-size: 10px; text-transform: uppercase; }
  .runtime-menu__modes { display: grid; gap: 5px; }
  .runtime-menu__modes button { display: grid; grid-template-columns: 18px minmax(0, 1fr) 16px; align-items: center; gap: 8px; min-height: 42px; padding: 6px 9px; color: inherit; background: transparent; border: 1px solid transparent; border-radius: 8px; text-align: left; }
  .runtime-menu__modes button:hover, .runtime-menu__modes button.active { background: var(--accent-soft, #e7f5ef); border-color: var(--border, #dce1db); }
  .runtime-menu__modes strong, .runtime-menu__modes em { display: block; }
  .runtime-menu__modes strong { font-size: 12px; }
  .runtime-menu__modes em { margin-top: 2px; color: var(--fg-muted, #687169); font-size: 10px; font-style: normal; }
  label { display: grid; gap: 5px; color: var(--fg-muted, #687169); font-size: 11px; }
  select, textarea { width: 100%; min-height: 34px; padding: 7px 9px; color: var(--fg, #1f2421); background: var(--surface, #fff); border: 1px solid var(--border, #dce1db); border-radius: 7px; font: inherit; }
  textarea { resize: vertical; }
  .runtime-menu__goal { display: grid; gap: 8px; padding-top: 10px; border-top: 1px solid var(--border, #dce1db); }
  .runtime-menu__goal > div { display: flex; justify-content: flex-end; gap: 7px; }
  .runtime-menu__goal button { min-height: 32px; padding: 0 10px; color: var(--fg, #1f2421); background: var(--surface, #fff); border: 1px solid var(--border, #dce1db); border-radius: 7px; font-size: 11px; }
  .runtime-menu__goal button.primary { color: #fff; background: var(--primary, #0f7b55); border-color: var(--primary, #0f7b55); }
  button:disabled, select:disabled, textarea:disabled { cursor: not-allowed; opacity: .55; }

  @media (max-width: 560px) {
    .runtime-menu__trigger span { display: none; }
    .runtime-menu__popover { max-height: min(280px, calc(100vh - 28px)); }
  }
</style>
