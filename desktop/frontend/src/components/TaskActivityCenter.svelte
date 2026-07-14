<script lang="ts">
  import { Activity, AlertTriangle, ChevronDown, GitCompareArrows, ListChecks, PauseCircle, Play, RotateCcw, Square } from "@lucide/svelte";

  import type { QueuedThreadMessage } from "../lib/task-lifecycle";
  import type { TaskResultReceipt } from "../lib/workbench-ia";
  import type { TabMeta } from "../lib/types";

  type RecoveryAction = "retry" | "restore-draft" | "rewind" | "open-diff";

  interface Props {
    tabs: TabMeta[];
    currentTabId: string;
    queuedMessages?: QueuedThreadMessage[];
    receipt?: TaskResultReceipt;
    changesCount?: number;
    checkpointCount?: number;
    lastError?: string;
    canRestoreDraft?: boolean;
    onSwitchTab?: (tabId: string) => void | Promise<void>;
    onCancelTab?: (tabId: string) => void | Promise<void>;
    onRecover?: (action: RecoveryAction) => void | Promise<void>;
  }

  let {
    tabs,
    currentTabId,
    queuedMessages = [],
    receipt,
    changesCount = 0,
    checkpointCount = 0,
    lastError = "",
    canRestoreDraft = false,
    onSwitchTab = () => undefined,
    onCancelTab = () => undefined,
    onRecover = () => undefined,
  }: Props = $props();

  const runningTabs = $derived(tabs.filter((tab) => tab.running));
  const pendingPromptCount = $derived(tabs.filter((tab) => tab.pendingPrompt).length);
  const currentTab = $derived(tabs.find((tab) => tab.id === currentTabId));
  const currentQueueCount = $derived(queuedMessages.filter((message) => message.tabId === currentTabId).length);
  const hasRecovery = $derived(Boolean(lastError || receipt?.state === "failed"));
  const recoveryKey = $derived(hasRecovery ? `${receipt?.id ?? "runtime"}:${receipt?.updatedAt ?? ""}:${lastError}` : "");
  let manuallyExpanded = $state(false);
  let collapsedRecoveryKey = $state("");
  const expanded = $derived(hasRecovery ? collapsedRecoveryKey !== recoveryKey : manuallyExpanded);

  function toggleExpanded() {
    if (hasRecovery) {
      collapsedRecoveryKey = expanded ? recoveryKey : "";
      return;
    }
    manuallyExpanded = !manuallyExpanded;
  }

  function tabTitle(tab: TabMeta) {
    return tab.label?.trim() || tab.topicTitle?.trim() || tab.workspaceName?.trim() || "未命名任务";
  }
</script>

<section class="activity-center" data-testid="task-activity-center">
  <header>
    <div class="activity-center__title">
      <Activity size={15} />
      <span>任务活动</span>
      <em class:running={Boolean(currentTab?.running)}>{currentTab?.running ? "当前运行中" : receipt?.state === "failed" ? "需要处理" : "状态已同步"}</em>
    </div>
    <div class="activity-center__metrics" aria-label="任务运行摘要">
      <span><strong>{currentQueueCount}</strong> 排队</span>
      <span><strong>{Math.max(0, runningTabs.length - (currentTab?.running ? 1 : 0))}</strong> 后台</span>
      <span><strong>{changesCount}</strong> 变更</span>
      <span><strong>{checkpointCount}</strong> 检查点</span>
      {#if pendingPromptCount}<span class="attention"><strong>{pendingPromptCount}</strong> 待决策</span>{/if}
    </div>
    <button
      class="activity-center__expand"
      class:expanded
      type="button"
      aria-label={expanded ? "收起任务活动" : "展开任务活动"}
      aria-expanded={expanded}
      onclick={toggleExpanded}
    ><ChevronDown size={15} /></button>
  </header>

  {#if expanded}
    <div class="activity-center__body">
      {#if runningTabs.length > 0}
        <div class="activity-center__runs">
          {#each runningTabs as tab (tab.id)}
            <article class:current={tab.id === currentTabId}>
              <div>
                <Play size={12} />
                <span>{tabTitle(tab)}</span>
                <em>{tab.id === currentTabId ? "当前" : "后台"}{tab.backgroundJobs ? ` · ${tab.backgroundJobs} 个工具` : ""}</em>
              </div>
              <div class="activity-center__actions">
                {#if tab.id !== currentTabId}<button type="button" onclick={() => onSwitchTab(tab.id)}>切换</button>{/if}
                <button class="danger" type="button" title="停止这个任务" onclick={() => onCancelTab(tab.id)}><Square size={11} /> 停止</button>
              </div>
            </article>
          {/each}
        </div>
      {/if}

      {#if hasRecovery}
        <div class="activity-center__recovery">
          <div>
            <AlertTriangle size={14} />
            <span><strong>结构化恢复</strong><em>{lastError || "上一轮失败，可选择安全恢复动作。"}</em></span>
          </div>
          <div class="activity-center__actions">
            <button type="button" onclick={() => onRecover("retry")}><Play size={12} /> 重试</button>
            <button type="button" disabled={!canRestoreDraft} onclick={() => onRecover("restore-draft")}><PauseCircle size={12} /> 恢复草稿</button>
            <button type="button" disabled={checkpointCount === 0} onclick={() => onRecover("rewind")}><RotateCcw size={12} /> 回到检查点</button>
            <button type="button" disabled={changesCount === 0} onclick={() => onRecover("open-diff")}><GitCompareArrows size={12} /> 查看 Diff</button>
          </div>
        </div>
      {:else if receipt}
        <div class="activity-center__receipt-state">
          <ListChecks size={13} />
          <span>{receipt.state === "running" ? "计划正在执行，证据将持续写入任务收据。" : "本轮已结束，等待验证证据与人工复核。"}</span>
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .activity-center {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 12px;
    background: var(--card, #fff);
  }

  header {
    display: grid;
    grid-template-columns: minmax(0, auto) minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
  }

  .activity-center__body {
    display: grid;
    gap: 10px;
    padding-top: 10px;
    border-top: 1px solid color-mix(in srgb, var(--border, #dce1db) 78%, transparent);
  }

  .activity-center__title,
  .activity-center__metrics,
  .activity-center__actions,
  article > div,
  .activity-center__recovery > div,
  .activity-center__receipt-state {
    display: flex;
    align-items: center;
  }

  .activity-center__title {
    min-width: 0;
    gap: 7px;
    color: var(--foreground, #1f2421);
  }

  .activity-center__title > span {
    font-size: 12px;
    font-weight: 650;
  }

  em {
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    font-style: normal;
    line-height: 1.4;
  }

  .activity-center__title em {
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--muted, #edf0ec);
    white-space: nowrap;
  }

  .activity-center__title em.running {
    background: color-mix(in srgb, var(--card, #fff) 88%, #0f7b55 12%);
    color: #0f7b55;
  }

  .activity-center__metrics {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 5px;
  }

  .activity-center__metrics span {
    padding: 4px 7px;
    border: 1px solid color-mix(in srgb, var(--border, #dce1db) 78%, transparent);
    border-radius: 6px;
    background: var(--card, #fff);
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    line-height: 1.35;
  }

  .activity-center__metrics strong {
    color: var(--foreground, #1f2421);
    font-variant-numeric: tabular-nums;
  }

  .activity-center__metrics .attention {
    border-color: color-mix(in srgb, #9a5b00 24%, var(--border, #dce1db));
    background: #fff8eb;
    color: #9a5b00;
  }

  .activity-center__runs {
    display: grid;
    gap: 6px;
  }

  article {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 42px;
    padding: 7px 8px 7px 10px;
    border: 1px solid color-mix(in srgb, var(--border, #dce1db) 78%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--card, #fff) 96%, var(--muted, #edf0ec));
    transition: border-color 150ms ease, background 150ms ease;
  }

  article.current {
    border-color: color-mix(in srgb, #0f7b55 30%, var(--border, #dce1db));
    background: color-mix(in srgb, var(--card, #fff) 93%, #0f7b55 7%);
  }

  article > div:first-child {
    min-width: 0;
    gap: 7px;
  }

  article span {
    overflow: hidden;
    color: var(--foreground, #1f2421);
    font-size: 12px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .activity-center__actions {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  button {
    appearance: none;
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0 10px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 6px;
    background: var(--card, #fff);
    color: var(--foreground, #1f2421);
    font: inherit;
    font-size: 11px;
    font-weight: 550;
    cursor: pointer;
    transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
  }

  button:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--primary, #1f2421) 28%, var(--border, #dce1db));
    background: var(--muted, #edf0ec);
  }

  button:focus-visible {
    outline: 2px solid color-mix(in srgb, #0f7b55 55%, transparent);
    outline-offset: 2px;
  }

  button.danger {
    color: var(--destructive, #b42318);
  }

  button.activity-center__expand {
    width: 32px;
    min-width: 32px;
    padding: 0;
    color: var(--muted-foreground, #687169);
  }

  button.activity-center__expand :global(svg) {
    transition: transform 150ms ease;
  }

  button.activity-center__expand.expanded :global(svg) {
    transform: rotate(180deg);
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .activity-center__recovery {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px;
    border: 1px solid color-mix(in srgb, #9a5b00 26%, var(--border, #dce1db));
    border-radius: 8px;
    background: #fff8eb;
    color: #9a5b00;
  }

  .activity-center__recovery > div:first-child {
    min-width: 0;
    gap: 8px;
  }

  .activity-center__recovery span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .activity-center__recovery strong {
    font-size: 12px;
    font-weight: 650;
  }

  .activity-center__recovery em {
    overflow: hidden;
    max-width: 520px;
    color: #7b4a05;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .activity-center__receipt-state {
    gap: 7px;
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    line-height: 1.5;
  }

  @media (max-width: 760px) {
    .activity-center__recovery {
      align-items: flex-start;
      flex-direction: column;
    }

    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      width: 100%;
      align-items: start;
      gap: 8px;
    }

    .activity-center__expand {
      grid-column: 2;
      grid-row: 1;
    }

    .activity-center__metrics {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .activity-center__metrics,
    .activity-center__actions {
      justify-content: flex-start;
    }

    article {
      align-items: flex-start;
      flex-direction: column;
    }

    button,
    button.activity-center__expand {
      min-height: 40px;
    }

    button.activity-center__expand {
      width: 40px;
      min-width: 40px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    article,
    button,
    button.activity-center__expand :global(svg) {
      transition: none;
    }
  }
</style>
