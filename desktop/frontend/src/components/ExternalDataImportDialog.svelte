<script lang="ts">
  import { onMount } from "svelte";
  import {
    AlertTriangle,
    Check,
    CheckCircle2,
    ChevronLeft,
    Database,
    FileWarning,
    FolderOpen,
    Import,
    Loader2,
    RefreshCw,
    ShieldCheck,
    X,
    XCircle,
  } from "@lucide/svelte";
  import { app } from "../lib/bridge";
  import type {
    ExternalDataImportItem,
    ExternalDataImportPreview,
    ExternalDataImportResult,
    ExternalDataSource,
  } from "../lib/types";

  let {
    onclose,
    onimported,
  }: {
    onclose: () => void;
    onimported: (result: ExternalDataImportResult) => void;
  } = $props();

  let sources = $state.raw<ExternalDataSource[]>([]);
  let selectedSourceID = $state("");
  let rootPath = $state("");
  let preview = $state.raw<ExternalDataImportPreview | undefined>();
  let result = $state.raw<ExternalDataImportResult | undefined>();
  let selectedItemIDs = $state<string[]>([]);
  let loading = $state(false);
  let errorMessage = $state("");

  const selectedSource = $derived(sources.find((source) => source.id === selectedSourceID));
  const selectableItems = $derived(preview?.items.filter((item) => item.compatibility !== "incompatible") ?? []);
  const selectedCount = $derived(selectedItemIDs.length);
  const allSelectableSelected = $derived(selectableItems.length > 0 && selectableItems.every((item) => selectedItemIDs.includes(item.id)));

  onMount(() => {
    void loadSources();
  });

  async function loadSources() {
    loading = true;
    errorMessage = "";
    try {
      const nextSources = await app().ExternalDataSources();
      sources = Array.isArray(nextSources) ? nextSources : [];
      const firstAvailable = sources.find((source) => source.available) ?? sources[0];
      if (firstAvailable) selectSource(firstAvailable);
    } catch (error) {
      errorMessage = formatError(error, "无法读取外部数据源，请确认正在桌面版中运行。");
    } finally {
      loading = false;
    }
  }

  function selectSource(source: ExternalDataSource) {
    selectedSourceID = source.id;
    rootPath = source.defaultRoot ?? "";
    preview = undefined;
    result = undefined;
    selectedItemIDs = [];
    errorMessage = "";
  }

  async function pickRoot() {
    if (!selectedSourceID || loading) return;
    loading = true;
    errorMessage = "";
    try {
      const selected = await app().PickExternalDataDirectory(selectedSourceID);
      if (selected) {
        rootPath = selected;
        preview = undefined;
        result = undefined;
        selectedItemIDs = [];
      }
    } catch (error) {
      errorMessage = formatError(error, "选择外部数据目录失败。");
    } finally {
      loading = false;
    }
  }

  async function scanSource() {
    if (!selectedSourceID) {
      errorMessage = "请选择一个外部数据源。";
      return;
    }
    if (!rootPath.trim()) {
      await pickRoot();
      if (!rootPath.trim()) return;
    }
    loading = true;
    errorMessage = "";
    result = undefined;
    try {
      const nextPreview = await app().PreviewExternalData({
        sourceId: selectedSourceID,
        rootPath: rootPath.trim(),
      });
      preview = nextPreview;
      selectedItemIDs = nextPreview.items.filter((item) => item.selectedByDefault && item.compatibility !== "incompatible").map((item) => item.id);
    } catch (error) {
      preview = undefined;
      selectedItemIDs = [];
      errorMessage = formatError(error, "扫描外部数据失败。");
    } finally {
      loading = false;
    }
  }

  function toggleItem(item: ExternalDataImportItem) {
    if (item.compatibility === "incompatible" || loading) return;
    selectedItemIDs = selectedItemIDs.includes(item.id)
      ? selectedItemIDs.filter((id) => id !== item.id)
      : [...selectedItemIDs, item.id];
  }

  function toggleAllSelectable() {
    selectedItemIDs = allSelectableSelected ? [] : selectableItems.map((item) => item.id);
  }

  async function importSelected() {
    if (!preview || selectedItemIDs.length === 0 || loading) {
      errorMessage = "请至少选择一项兼容数据。";
      return;
    }
    loading = true;
    errorMessage = "";
    try {
      const importResult = await app().ImportExternalData({
        sourceId: preview.sourceId,
        rootPath: preview.rootPath,
        itemIds: selectedItemIDs,
      });
      result = importResult;
      onimported(importResult);
    } catch (error) {
      errorMessage = formatError(error, "导入外部数据失败。");
    } finally {
      loading = false;
    }
  }

  function backToSources() {
    preview = undefined;
    result = undefined;
    selectedItemIDs = [];
    errorMessage = "";
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && !loading) onclose();
  }

  function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "—";
    const units = ["B", "KiB", "MiB", "GiB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
  }

  function formatError(error: unknown, fallback: string) {
    if (error instanceof Error && error.message.trim()) return error.message;
    const text = String(error ?? "").trim();
    return text && text !== "[object Object]" ? text : fallback;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="external-import-backdrop" role="presentation">
  <div class="external-import-dialog" role="dialog" aria-modal="true" aria-labelledby="external-import-title">
    <header class="dialog-header">
      <div>
        <span>External Data</span>
        <h2 id="external-import-title">导入外部数据</h2>
        <p>先扫描并确认兼容性，再将原始内容安全导入 Volt。外部目录始终保持只读。</p>
      </div>
      <button class="icon-button" type="button" aria-label="关闭导入外部数据" disabled={loading} onclick={onclose}><X size={17} /></button>
    </header>

    <div class="dialog-body">
      {#if errorMessage}
        <div class="state-banner danger" role="alert"><XCircle size={16} /><span>{errorMessage}</span></div>
      {/if}

      {#if result}
        <section class="result-view" aria-live="polite">
          <div class="result-summary">
            <CheckCircle2 size={22} />
            <div><strong>{result.summary}</strong><span>已导入的数据立即进入对应的知识库或技能目录。</span></div>
          </div>
          <div class="result-stats">
            <article><span>已导入</span><strong>{result.imported}</strong></article>
            <article><span>已跳过</span><strong>{result.skipped}</strong></article>
            <article><span>失败</span><strong>{result.failed}</strong></article>
          </div>
          {#if result.warnings.length}
            <div class="state-banner warning"><AlertTriangle size={16} /><div>{#each result.warnings as warning (warning)}<p>{warning}</p>{/each}</div></div>
          {/if}
          <div class="result-list">
            {#each result.items as item (item.id)}
              <article class={`result-row ${item.status}`}>
                {#if item.status === "imported"}<CheckCircle2 size={16} />{:else if item.status === "skipped"}<AlertTriangle size={16} />{:else}<XCircle size={16} />{/if}
                <div><strong>{item.title || "未知项目"}</strong><span>{item.message}</span></div>
                <em>{item.status === "imported" ? "已导入" : item.status === "skipped" ? "已跳过" : "失败"}</em>
              </article>
            {/each}
          </div>
        </section>
      {:else if preview}
        <section class="preview-view">
          <div class="preview-toolbar">
            <div>
              <button class="back-button" type="button" disabled={loading} onclick={backToSources}><ChevronLeft size={15} /> 更换来源</button>
              <strong>{preview.sourceName}</strong>
              <span title={preview.rootPath}>{preview.rootPath}</span>
            </div>
            <button class="secondary-button" type="button" disabled={loading} onclick={() => void scanSource()}><RefreshCw size={15} /> 重新扫描</button>
          </div>
          <div class="preview-stats">
            <article class="success"><Check size={15} /><span>兼容</span><strong>{preview.compatible}</strong></article>
            <article class="warning"><AlertTriangle size={15} /><span>需确认</span><strong>{preview.warnings}</strong></article>
            <article class="danger"><FileWarning size={15} /><span>不兼容</span><strong>{preview.unsupported}</strong></article>
          </div>
          {#each preview.messages as message (message)}
            <div class="state-banner warning"><AlertTriangle size={16} /><span>{message}</span></div>
          {/each}
          <div class="selection-toolbar">
            <div><strong>扫描结果</strong><span>已选择 {selectedCount} / {selectableItems.length} 项</span></div>
            <button type="button" disabled={loading || selectableItems.length === 0} onclick={toggleAllSelectable}>{allSelectableSelected ? "取消全选" : "选择全部兼容项"}</button>
          </div>
          <div class="import-item-list">
            {#each preview.items as item (item.id)}
              <label class={`import-item ${item.compatibility} ${selectedItemIDs.includes(item.id) ? "selected" : ""}`}>
                <input
                  type="checkbox"
                  checked={selectedItemIDs.includes(item.id)}
                  disabled={loading || item.compatibility === "incompatible"}
                  onchange={() => toggleItem(item)}
                />
                <span class="compatibility-icon">
                  {#if item.compatibility === "compatible"}<ShieldCheck size={17} />{:else if item.compatibility === "warning"}<AlertTriangle size={17} />{:else}<FileWarning size={17} />{/if}
                </span>
                <div class="item-copy">
                  <div><strong>{item.title}</strong><em class={`status ${item.compatibility}`}>{item.compatibilityText}</em></div>
                  <p>{item.category} → {item.targetLabel} · {formatBytes(item.size)}</p>
                  <code title={item.relativePath}>{item.relativePath}</code>
                  {#if item.warning}<small>{item.warning}</small>{/if}
                </div>
              </label>
            {:else}
              <div class="empty-state"><Database size={22} /><strong>没有可显示的数据</strong><p>请选择其他目录或数据源后重新扫描。</p></div>
            {/each}
          </div>
        </section>
      {:else}
        <section class="source-view">
          <div class="source-list" aria-label="选择外部数据源">
            {#each sources as source (source.id)}
              <button class={`source-row ${selectedSourceID === source.id ? "active" : ""}`} type="button" onclick={() => selectSource(source)}>
                <span class="source-icon">{#if source.id === "trae"}<Import size={18} />{:else}<FolderOpen size={18} />{/if}</span>
                <div><strong>{source.name}</strong><p>{source.description}</p><small>{source.categories.join(" · ")}</small></div>
                <em>{source.available ? "可用" : "未检测到"}</em>
              </button>
            {:else}
              <div class="empty-state"><Database size={22} /><strong>未加载数据源</strong><p>请确认桌面后端已启动，然后重试。</p></div>
            {/each}
          </div>

          {#if selectedSource}
            <div class="source-detail">
              <div class="path-field">
                <label for="external-data-root">数据目录</label>
                <div><input id="external-data-root" value={rootPath} readonly placeholder="请选择外部数据目录" /><button type="button" disabled={loading} onclick={() => void pickRoot()}><FolderOpen size={15} /> 选择目录</button></div>
              </div>
              {#if selectedSource.warning}<div class="state-banner neutral"><ShieldCheck size={16} /><span>{selectedSource.warning}</span></div>{/if}
            </div>
          {/if}
        </section>
      {/if}
    </div>

    <footer class="dialog-footer">
      {#if loading}<span class="loading-state" role="status"><Loader2 class="spin" size={15} /> 正在处理，请稍候…</span>{:else}<span>不兼容项目不会写入，已有同名技能不会被覆盖。</span>{/if}
      <div>
        {#if result}
          <button class="secondary-button" type="button" onclick={backToSources}>继续导入</button>
          <button class="primary-button" type="button" onclick={onclose}>完成</button>
        {:else if preview}
          <button class="secondary-button" type="button" disabled={loading} onclick={onclose}>取消</button>
          <button class="primary-button" type="button" disabled={loading || selectedCount === 0} onclick={() => void importSelected()}><Import size={15} /> 导入所选 {selectedCount ? `(${selectedCount})` : ""}</button>
        {:else}
          <button class="secondary-button" type="button" disabled={loading} onclick={onclose}>取消</button>
          <button class="primary-button" type="button" disabled={loading || !selectedSourceID || !rootPath.trim()} onclick={() => void scanSource()}><ShieldCheck size={15} /> 扫描并检查兼容性</button>
        {/if}
      </div>
    </footer>
  </div>
</div>

<style>
  .external-import-backdrop {
    position: fixed;
    inset: 0;
    z-index: 160;
    display: grid;
    place-items: center;
    padding: 24px;
    background: color-mix(in srgb, var(--foreground, #1f2421) 28%, transparent);
  }

  .external-import-dialog {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: min(900px, 100%);
    max-height: min(780px, calc(100vh - 48px));
    overflow: hidden;
    border: 1px solid var(--border-strong, #c7cfc7);
    border-radius: 16px;
    background: var(--background, #fff);
    color: var(--foreground, #1f2421);
    box-shadow: 0 24px 70px rgb(31 36 33 / 20%);
  }

  .dialog-header,
  .dialog-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 18px;
    background: var(--background, #fff);
  }

  .dialog-header { border-bottom: 1px solid var(--border, #dce1db); }
  .dialog-footer { border-top: 1px solid var(--border, #dce1db); }
  .dialog-header > div { min-width: 0; }
  .dialog-header span { color: var(--muted-foreground, #687169); font-size: 10px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
  .dialog-header h2 { margin: 3px 0 2px; font-size: 17px; line-height: 1.35; }
  .dialog-header p { margin: 0; color: var(--muted-foreground, #687169); font-size: 12px; line-height: 1.5; }

  .dialog-body { min-height: 0; overflow: auto; padding: 16px 18px; background: var(--muted, #edf0ec); }
  .dialog-footer > span { min-width: 0; color: var(--muted-foreground, #687169); font-size: 11px; }
  .dialog-footer > div { display: flex; flex: 0 0 auto; gap: 8px; }

  button,
  input { font: inherit; }
  button { cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .52; }
  button:focus-visible,
  input:focus-visible { outline: 2px solid color-mix(in srgb, var(--primary, #1f2421) 42%, transparent); outline-offset: 2px; }

  .icon-button,
  .secondary-button,
  .primary-button,
  .back-button,
  .path-field button,
  .selection-toolbar button {
    display: inline-flex;
    min-height: 34px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 12px;
    border: 1px solid var(--border-strong, #c7cfc7);
    border-radius: 7px;
    background: var(--background, #fff);
    color: var(--foreground, #1f2421);
    font-size: 12px;
    font-weight: 600;
  }
  .icon-button { width: 34px; padding: 0; }
  .primary-button { border-color: var(--primary, #1f2421); background: var(--primary, #1f2421); color: var(--primary-foreground, #fff); }
  .back-button { min-height: 28px; padding: 0 8px; border-color: transparent; background: transparent; }

  .source-view,
  .preview-view,
  .result-view { display: grid; gap: 14px; }
  .source-list { display: grid; gap: 8px; }
  .source-row {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 76px;
    padding: 12px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 10px;
    background: var(--background, #fff);
    color: inherit;
    text-align: left;
  }
  .source-row.active { border-color: var(--foreground, #1f2421); box-shadow: inset 0 0 0 1px var(--foreground, #1f2421); }
  .source-icon { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 8px; background: var(--accent, #e8e8e8); }
  .source-row div { min-width: 0; }
  .source-row strong,
  .source-row p,
  .source-row small { display: block; }
  .source-row p { margin: 3px 0; color: var(--muted-foreground, #687169); font-size: 12px; line-height: 1.45; }
  .source-row small { color: var(--muted-foreground, #687169); font-size: 10px; }
  .source-row em { color: var(--success, #0f7b55); font-size: 11px; font-style: normal; font-weight: 650; }

  .source-detail { display: grid; gap: 10px; padding-top: 2px; }
  .path-field { display: grid; gap: 6px; }
  .path-field label { font-size: 11px; font-weight: 650; }
  .path-field > div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
  .path-field input { min-width: 0; height: 34px; padding: 0 10px; border: 1px solid var(--border-strong, #c7cfc7); border-radius: 7px; background: var(--background, #fff); color: var(--foreground, #1f2421); font-family: ui-monospace, SFMono-Regular, SF Mono, Consolas, monospace; font-size: 11px; }

  .state-banner {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 8px;
    background: var(--background, #fff);
    font-size: 12px;
    line-height: 1.5;
  }
  .state-banner :global(svg) { flex: 0 0 auto; margin-top: 1px; }
  .state-banner p { margin: 0; }
  .state-banner.warning { border-color: color-mix(in srgb, var(--warning, #9a5b00) 28%, var(--border, #dce1db)); background: var(--warning-soft, #fff4de); color: var(--warning, #9a5b00); }
  .state-banner.danger { border-color: color-mix(in srgb, var(--danger, #b42318) 28%, var(--border, #dce1db)); background: var(--danger-soft, #fdecea); color: var(--danger, #b42318); }
  .state-banner.neutral { color: var(--muted-foreground, #687169); }

  .preview-toolbar,
  .selection-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .preview-toolbar > div { display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: center; gap: 8px; min-width: 0; }
  .preview-toolbar strong { font-size: 13px; }
  .preview-toolbar span { overflow: hidden; color: var(--muted-foreground, #687169); font-family: ui-monospace, SFMono-Regular, SF Mono, Consolas, monospace; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .selection-toolbar > div { display: grid; gap: 2px; }
  .selection-toolbar strong { font-size: 13px; }
  .selection-toolbar span { color: var(--muted-foreground, #687169); font-size: 11px; }
  .selection-toolbar button { min-height: 30px; }

  .preview-stats,
  .result-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .preview-stats article,
  .result-stats article { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 7px; min-height: 42px; padding: 0 10px; border: 1px solid var(--border, #dce1db); border-radius: 8px; background: var(--background, #fff); }
  .preview-stats span,
  .result-stats span { color: var(--muted-foreground, #687169); font-size: 11px; }
  .preview-stats strong,
  .result-stats strong { font-size: 15px; font-variant-numeric: tabular-nums; }
  .preview-stats .success { color: var(--success, #0f7b55); }
  .preview-stats .warning { color: var(--warning, #9a5b00); }
  .preview-stats .danger { color: var(--danger, #b42318); }

  .import-item-list,
  .result-list { display: grid; gap: 7px; max-height: 410px; overflow: auto; padding-right: 3px; scrollbar-gutter: stable; }
  .import-item {
    display: grid;
    grid-template-columns: auto 28px minmax(0, 1fr);
    align-items: start;
    gap: 10px;
    padding: 11px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 9px;
    background: var(--background, #fff);
  }
  .import-item.selected { border-color: var(--foreground, #1f2421); }
  .import-item.incompatible { opacity: .72; }
  .import-item input { width: 16px; height: 16px; margin: 4px 0 0; accent-color: var(--primary, #1f2421); }
  .compatibility-icon { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 7px; background: var(--muted, #edf0ec); color: var(--foreground, #1f2421); }
  .import-item.warning .compatibility-icon { background: var(--warning-soft, #fff4de); color: var(--warning, #9a5b00); }
  .import-item.incompatible .compatibility-icon { background: var(--danger-soft, #fdecea); color: var(--danger, #b42318); }
  .item-copy { display: grid; min-width: 0; gap: 3px; }
  .item-copy > div { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .item-copy strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .item-copy p,
  .item-copy small { margin: 0; color: var(--muted-foreground, #687169); font-size: 10px; line-height: 1.45; }
  .item-copy code { overflow: hidden; color: var(--muted-foreground, #687169); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .item-copy small { color: var(--warning, #9a5b00); }
  .status { flex: 0 0 auto; padding: 2px 7px; border-radius: 999px; background: var(--success-soft, #e7f5ef); color: var(--success, #0f7b55); font-size: 10px; font-style: normal; font-weight: 650; }
  .status.warning { background: var(--warning-soft, #fff4de); color: var(--warning, #9a5b00); }
  .status.incompatible { background: var(--danger-soft, #fdecea); color: var(--danger, #b42318); }

  .result-summary { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid color-mix(in srgb, var(--success, #0f7b55) 24%, var(--border, #dce1db)); border-radius: 10px; background: var(--success-soft, #e7f5ef); color: var(--success, #0f7b55); }
  .result-summary div { display: grid; gap: 2px; }
  .result-summary strong { font-size: 14px; }
  .result-summary span { font-size: 11px; }
  .result-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 10px 11px; border: 1px solid var(--border, #dce1db); border-radius: 8px; background: var(--background, #fff); }
  .result-row div { min-width: 0; }
  .result-row strong,
  .result-row span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .result-row strong { font-size: 12px; }
  .result-row span { margin-top: 2px; color: var(--muted-foreground, #687169); font-size: 10px; }
  .result-row em { font-size: 10px; font-style: normal; font-weight: 650; }
  .result-row.imported { color: var(--success, #0f7b55); }
  .result-row.skipped { color: var(--warning, #9a5b00); }
  .result-row.failed { color: var(--danger, #b42318); }

  .empty-state { display: grid; justify-items: center; gap: 5px; padding: 28px; border: 1px dashed var(--border-strong, #c7cfc7); border-radius: 10px; color: var(--muted-foreground, #687169); text-align: center; }
  .empty-state strong { color: var(--foreground, #1f2421); font-size: 13px; }
  .empty-state p { margin: 0; font-size: 11px; }
  .loading-state { display: inline-flex; align-items: center; gap: 6px; }
  .spin { animation: spin .8s linear infinite; }

  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 720px) {
    .external-import-backdrop { padding: 0; }
    .external-import-dialog { width: 100%; max-height: 100vh; height: 100vh; border: 0; border-radius: 0; }
    .dialog-header,
    .dialog-footer { align-items: flex-start; padding: 14px; }
    .dialog-body { padding: 12px 14px; }
    .dialog-footer { flex-direction: column; }
    .dialog-footer > div { width: 100%; }
    .dialog-footer button { flex: 1; }
    .source-row { grid-template-columns: 36px minmax(0, 1fr); }
    .source-row em { grid-column: 2; }
    .preview-toolbar,
    .selection-toolbar { align-items: flex-start; flex-direction: column; }
    .preview-toolbar > div { width: 100%; grid-template-columns: auto minmax(0, 1fr); }
    .preview-toolbar span { grid-column: 1 / -1; }
    .preview-stats,
    .result-stats { grid-template-columns: 1fr; }
    .path-field > div { grid-template-columns: 1fr; }
    .import-item-list,
    .result-list { max-height: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin { animation: none; }
  }
</style>
