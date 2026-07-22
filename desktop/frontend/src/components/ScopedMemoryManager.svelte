<script lang="ts">
  import {
    Archive,
    Eye,
    EyeOff,
    Layers3,
    Pencil,
    Plus,
    RefreshCw,
    Save,
    Trash2,
  } from "@lucide/svelte";

  import {
    MEMORY_LAYER_LABELS,
    formatGovernanceTimestamp,
    groupScopedMemoryEntries,
    scopeLabelForMemoryLayer,
    scopeIDForMemoryLayer,
  } from "../lib/data-governance";
  import type {
    ScopedMemoryEntry,
    ScopedMemoryInput,
    ScopedMemoryLayer,
    ScopedMemoryReference,
    ScopedMemoryView,
  } from "../lib/types";
  import ScrollToTop from "./ScrollToTop.svelte";

  interface Props {
    view?: ScopedMemoryView;
    loading: boolean;
    error: string;
    backendAvailable: boolean;
    running: boolean;
    onRefresh: () => void;
    onOpenTrust: () => void;
    onSave: (input: ScopedMemoryInput) => Promise<void>;
    onIsolation: (entryID: string, isolated: boolean) => Promise<void>;
    onDelete: (entryID: string) => Promise<void>;
  }

  let {
    view,
    loading,
    error,
    backendAvailable,
    running,
    onRefresh,
    onOpenTrust,
    onSave,
    onIsolation,
    onDelete,
  }: Props = $props();

  let editorOpen = $state(false);
  let editingID = $state("");
  let draftTitle = $state("");
  let draftBody = $state("");
  let draftSource = $state("manual");
  let draftLayer = $state<ScopedMemoryLayer>("project");
  let draftReferences = $state("");
  let draftIsolated = $state(false);
  let mutating = $state(false);
  let actionMessage = $state("");
  let actionError = $state("");

  const groups = $derived(groupScopedMemoryEntries(view?.entries ?? []));
  const scopeID = $derived(view ? scopeIDForMemoryLayer(view.context, draftLayer) : "");
  const mutationDisabled = $derived(!backendAvailable || running || mutating || !view?.available);
  const hasMemoryRecords = $derived(Boolean(view?.entries.length || view?.archives.length));

  function referencesText(references: ScopedMemoryReference[]): string {
    return references.map((reference) => [reference.id, reference.title, reference.source].filter(Boolean).join(" | ")).join("\n");
  }

  function parseReferences(value: string): ScopedMemoryReference[] {
    const seen: string[] = [];
    return value.split(/\r?\n/).flatMap((line) => {
      const [id = "", title = "", source = ""] = line.split("|").map((part) => part.trim());
      if (!id || seen.includes(id)) return [];
      seen.push(id);
      return [{ id, title: title || undefined, source: source || undefined }];
    });
  }

  function resetEditor() {
    editingID = "";
    draftTitle = "";
    draftBody = "";
    draftSource = "manual";
    draftLayer = view?.context.projectId ? "project" : "thread";
    draftReferences = "";
    draftIsolated = false;
    actionError = "";
  }

  function openCreate() {
    resetEditor();
    editorOpen = true;
  }

  function openEdit(entry: ScopedMemoryEntry) {
    editingID = entry.id;
    draftTitle = entry.title;
    draftBody = entry.body;
    draftSource = entry.source;
    draftLayer = entry.layer;
    draftReferences = referencesText(entry.references);
    draftIsolated = entry.isolated;
    actionError = "";
    editorOpen = true;
  }

  async function saveDraft() {
    actionError = "";
    actionMessage = "";
    if (!draftTitle.trim() || !draftBody.trim() || !draftSource.trim() || !scopeID) {
      actionError = "标题、正文、来源和有效 Scope 均为必填项。";
      return;
    }
    mutating = true;
    try {
      await onSave({
        id: editingID || undefined,
        title: draftTitle.trim(),
        body: draftBody.trim(),
        source: draftSource.trim(),
        layer: draftLayer,
        scopeId: scopeID,
        references: parseReferences(draftReferences),
        isolated: draftIsolated,
      });
      actionMessage = editingID ? "记忆已更新并刷新当前运行时。" : "记忆已保存并刷新当前运行时。";
      editorOpen = false;
      resetEditor();
    } catch (caught) {
      actionError = `${caught instanceof Error ? caught.message : String(caught)}。列表已重新读取；该变更可能已写入，但运行时刷新未完整完成。`;
    } finally {
      mutating = false;
    }
  }

  async function toggleIsolation(entry: ScopedMemoryEntry) {
    mutating = true;
    actionError = "";
    actionMessage = "";
    try {
      await onIsolation(entry.id, !entry.isolated);
      actionMessage = entry.isolated ? "记忆已重新加入运行时。" : "记忆已隔离，不再进入当前运行时。";
    } catch (caught) {
      actionError = `${caught instanceof Error ? caught.message : String(caught)}。列表已重新读取，请按当前状态复核。`;
    } finally {
      mutating = false;
    }
  }

  async function deleteEntry(entry: ScopedMemoryEntry) {
    if (typeof window !== "undefined" && !window.confirm(`删除并归档“${entry.title}”？当前版本不提供从归档恢复。`)) return;
    mutating = true;
    actionError = "";
    actionMessage = "";
    try {
      await onDelete(entry.id);
      actionMessage = "记忆已删除并进入审计归档。";
    } catch (caught) {
      actionError = `${caught instanceof Error ? caught.message : String(caught)}。列表已重新读取，请核对归档状态。`;
    } finally {
      mutating = false;
    }
  }
</script>

<section class="memory-manager" data-testid="scoped-memory-manager">
  <header class="memory-toolbar">
    <div><span>Layered Memory</span><strong>分层记忆</strong><p>User → Organization → Workspace → Project → Thread，所有条目都保留来源、引用和所有权链路。</p></div>
    <div><button type="button" onclick={onOpenTrust}>数据与信任</button><button type="button" disabled={loading || !backendAvailable} onclick={onRefresh}><RefreshCw size={14} /> {loading ? "读取中" : "刷新"}</button><button class="primary" type="button" disabled={mutationDisabled} onclick={openCreate}><Plus size={14} /> 新建记忆</button></div>
  </header>

  {#if running}<div class="runtime-lock"><Layers3 size={15} /><span>当前 Thread 正在运行。为避免提示词和审计状态分裂，运行结束前不可修改分层记忆。</span></div>{/if}
  {#if actionMessage}<div class="inline-message success">{actionMessage}</div>{/if}
  {#if actionError}<div class="inline-message danger">{actionError}</div>{/if}
  {#if error}<div class="inline-message danger">{error}</div>{/if}

  {#if !backendAvailable}
    <article class="memory-empty"><Layers3 size={28} /><strong>未连接桌面后端</strong><p>分层记忆不会使用浏览器预览数据。请在 Wails 桌面运行环境中管理当前 Thread 的真实记忆。</p></article>
  {:else if loading && !view}
    <article class="memory-empty"><span class="spin"><RefreshCw size={26} /></span><strong>正在读取分层记忆</strong></article>
  {:else if view}
    <section class="memory-context" aria-label="记忆所有权上下文">
      <article><span>组织</span><strong title={view.context.organizationId || ""}>{scopeLabelForMemoryLayer(view.context, view.contextLabels, "organization")}</strong></article>
      <article><span>工作区</span><strong title={view.context.workspaceId || ""}>{scopeLabelForMemoryLayer(view.context, view.contextLabels, "workspace")}</strong></article>
      <article><span>项目</span><strong title={view.context.projectId || ""}>{scopeLabelForMemoryLayer(view.context, view.contextLabels, "project")}</strong></article>
      <article><span>对话</span><strong title={view.context.threadId || ""}>{scopeLabelForMemoryLayer(view.context, view.contextLabels, "thread")}</strong></article>
    </section>

    {#if !hasMemoryRecords}
      <article class="memory-empty memory-empty--onboarding">
        <Layers3 size={28} />
        <strong>尚未添加分层记忆</strong>
        <p>这里只显示明确写入 User、Organization、Workspace、Project 或 Thread 层的 scoped memory。Agent Profile 的 MEMORY.md、普通项目文档和其他工具的记忆不会自动归入这里。</p>
        <button class="primary" type="button" disabled={mutationDisabled} onclick={openCreate}><Plus size={14} /> 添加第一条记忆</button>
      </article>
    {:else}
      <div class="memory-layout">
        <div class="layer-stack">
          {#each groups as group (group.layer)}
            <section class="memory-layer" data-layer={group.layer}>
              <header><div><strong>{group.label}</strong><span title={scopeIDForMemoryLayer(view.context, group.layer)}>{scopeLabelForMemoryLayer(view.context, view.contextLabels, group.layer)}</span></div><em>{group.entries.length} 条</em></header>
              <div>
                {#each group.entries as entry (entry.id)}
                  <article class:isolated={entry.isolated} class="memory-entry" data-testid="scoped-memory-entry">
                    <div class="entry-head"><div><strong>{entry.title}</strong><span>{entry.source} · {formatGovernanceTimestamp(entry.updatedAt)}</span></div><b>{entry.isolated ? "已隔离" : "运行中可见"}</b></div>
                    <p>{entry.body}</p>
                    <dl><dt>Owner</dt><dd>{[entry.owner.organizationId, entry.owner.workspaceId, entry.owner.projectId, entry.owner.threadId].filter(Boolean).join(" → ") || "User global"}</dd><dt>References</dt><dd>{entry.references.length ? entry.references.map((reference) => reference.title || reference.id).join(" / ") : "无"}</dd></dl>
                    <footer><button type="button" disabled={mutationDisabled} onclick={() => openEdit(entry)}><Pencil size={13} /> 编辑</button><button type="button" disabled={mutationDisabled} onclick={() => void toggleIsolation(entry)}>{#if entry.isolated}<Eye size={13} /> 取消隔离{:else}<EyeOff size={13} /> 隔离{/if}</button><button class="danger" type="button" disabled={mutationDisabled} onclick={() => void deleteEntry(entry)}><Trash2 size={13} /> 删除并归档</button></footer>
                  </article>
                {:else}
                  <div class="layer-empty">该层暂无记忆。</div>
                {/each}
              </div>
            </section>
          {/each}
        </div>

        <aside class="archive-panel">
          <header><Archive size={15} /><div><strong>审计归档</strong><span>删除后的条目只读保留</span></div><em>{view.archives.length}</em></header>
          {#each view.archives as archive (archive.entry.id)}
            <details><summary>{archive.entry.title}<span>{MEMORY_LAYER_LABELS[archive.entry.layer]}</span></summary><div><p>{archive.entry.body}</p><dl><dt>来源</dt><dd>{archive.entry.source}</dd><dt>归档时间</dt><dd>{formatGovernanceTimestamp(archive.archivedAt)}</dd><dt>原 Scope</dt><dd>{archive.entry.scopeId}</dd></dl></div></details>
          {:else}<div class="archive-empty">暂无归档记录。</div>{/each}
          {#if view.storePath}<details class="store-path"><summary>查看本地存储路径</summary><code>{view.storePath}</code></details>{/if}
        </aside>
      </div>
    {/if}
  {/if}
</section>

<ScrollToTop />

{#if editorOpen && view}
  <div class="memory-editor-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget && !mutating) editorOpen = false; }}>
    <div class="memory-editor" role="dialog" aria-modal="true" aria-labelledby="memory-editor-title">
      <header><div><span>Scoped Memory</span><strong id="memory-editor-title">{editingID ? "编辑分层记忆" : "新建分层记忆"}</strong></div><button type="button" disabled={mutating} onclick={() => (editorOpen = false)}>关闭</button></header>
      <div class="editor-grid">
        <label>标题<input bind:value={draftTitle} maxlength="256" placeholder="例如 发布前必须运行桌面测试" /></label>
        <label>来源<input bind:value={draftSource} placeholder="manual / project-brief / user-profile" /></label>
        <label>记忆层<select bind:value={draftLayer}><option value="user">User</option><option value="organization">Organization</option><option value="workspace">Workspace</option><option value="project">Project</option><option value="thread">Thread</option></select></label>
        <label>Scope ID<input value={scopeID} readonly /></label>
        <label class="wide">正文<textarea bind:value={draftBody} rows="8" placeholder="写入会参与运行时上下文的明确事实、约束或偏好。"></textarea></label>
        <label class="wide">引用<textarea bind:value={draftReferences} rows="4" placeholder="每行：reference-id | 标题 | 来源"></textarea></label>
        <label class="isolation-toggle"><input type="checkbox" bind:checked={draftIsolated} /><span><strong>保存为隔离条目</strong><em>条目可审计，但不会进入当前运行时提示词。</em></span></label>
      </div>
      <footer><button type="button" disabled={mutating} onclick={() => (editorOpen = false)}>取消</button><button class="primary" type="button" disabled={mutating || running} onclick={() => void saveDraft()}><Save size={14} /> {mutating ? "保存并刷新中" : "保存并刷新运行时"}</button></footer>
    </div>
  </div>
{/if}

<style>
  .memory-manager { display: grid; gap: 14px; min-width: 0; padding: 18px; color: #172033; }
  .memory-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 14px; border-bottom: 1px solid #e5e9f0; }.memory-toolbar > div:first-child { min-width: 0; }.memory-toolbar span { color: #667085; font-size: 10px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }.memory-toolbar strong { display: block; margin-top: 3px; font-size: 20px; }.memory-toolbar p { max-width: 720px; margin: 6px 0 0; color: #667085; font-size: 12px; line-height: 1.6; }.memory-toolbar > div:last-child { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
  button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; padding: 0 11px; border: 1px solid #d8dee8; border-radius: 9px; background: #fff; color: #344054; font: inherit; font-size: 11px; font-weight: 650; cursor: pointer; } button.primary { border-color: #1f5fbf; background: #1f5fbf; color: #fff; } button.danger { color: #b42318; } button:disabled { cursor: not-allowed; opacity: .5; }
  .runtime-lock, .inline-message { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid #ecd59d; border-radius: 10px; background: #fffaf0; color: #8b5c00; font-size: 11px; }.inline-message.success { border-color: #b9dfc7; background: #f2fbf5; color: #167044; }.inline-message.danger { border-color: #efc1bb; background: #fff6f5; color: #a52b1e; }
  .memory-empty { display: grid; justify-items: center; gap: 8px; min-height: 280px; align-content: center; padding: 30px; border: 1px dashed #cfd7e4; border-radius: 14px; background: #fbfcfe; text-align: center; }.memory-empty strong { font-size: 16px; }.memory-empty p { max-width: 560px; margin: 0; color: #667085; font-size: 12px; line-height: 1.6; }
  .memory-empty--onboarding { min-height: 240px; }.memory-empty--onboarding button { margin-top: 4px; }
  .memory-context { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; overflow: hidden; border: 1px solid #dfe4ec; border-radius: 12px; background: #dfe4ec; }.memory-context article { min-width: 0; padding: 11px 12px; background: #fff; }.memory-context span { display: block; color: #7b8494; font-size: 9px; text-transform: uppercase; }.memory-context strong { display: block; margin-top: 4px; overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .memory-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(250px, .34fr); gap: 12px; align-items: start; }.layer-stack { display: grid; gap: 10px; min-width: 0; }.memory-layer, .archive-panel { overflow: hidden; border: 1px solid #dfe4ec; border-radius: 13px; background: #fff; }.memory-layer > header, .archive-panel > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 13px; border-bottom: 1px solid #edf0f4; background: #fafbfc; }.memory-layer header strong, .archive-panel header strong { font-size: 12px; }.memory-layer header span, .archive-panel header span { display: block; margin-top: 2px; color: #7b8494; font-size: 9px; }.memory-layer header em, .archive-panel header em { color: #667085; font-size: 9px; font-style: normal; }
  .memory-entry { padding: 12px 13px; border-top: 1px solid #edf0f4; }.memory-entry:first-child { border-top: 0; }.memory-entry.isolated { background: #f8f9fb; }.entry-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }.entry-head strong { font-size: 12px; }.entry-head span { display: block; margin-top: 3px; color: #7b8494; font-size: 9px; }.entry-head b { padding: 4px 7px; border-radius: 999px; background: #eaf7ef; color: #187448; font-size: 9px; white-space: nowrap; }.isolated .entry-head b { background: #f1f3f5; color: #697386; }.memory-entry > p { display: -webkit-box; margin: 9px 0; overflow: hidden; color: #475467; font-size: 11px; line-height: 1.55; line-clamp: 3; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }.memory-entry dl { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 5px 8px; margin: 0; font-size: 9px; }.memory-entry dt { color: #7b8494; }.memory-entry dd { margin: 0; overflow-wrap: anywhere; }.memory-entry footer { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }.memory-entry footer button { min-height: 28px; padding: 0 8px; font-size: 9px; }.layer-empty, .archive-empty { padding: 16px; color: #7b8494; font-size: 10px; text-align: center; }
  .archive-panel { position: sticky; top: 12px; }.archive-panel > header { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; }.archive-panel details { margin: 0; padding: 10px 12px; border-top: 1px solid #edf0f4; }.archive-panel summary { display: flex; justify-content: space-between; gap: 8px; color: #344054; font-size: 10px; font-weight: 650; cursor: pointer; }.archive-panel summary span { color: #667085; font-size: 8px; }.archive-panel details > div { margin-top: 8px; padding: 8px; border-radius: 8px; background: #f7f9fb; }.archive-panel p { margin: 0 0 8px; color: #475467; font-size: 10px; line-height: 1.5; }.archive-panel dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 8px; margin: 0; font-size: 9px; }.archive-panel dt { color: #7b8494; }.archive-panel dd { margin: 0; overflow-wrap: anywhere; }.store-path code { display: block; margin-top: 7px; overflow-wrap: anywhere; }
  .memory-editor-backdrop { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: 18px; background: rgba(15, 23, 42, .38); }.memory-editor { width: min(720px, 96vw); max-height: 90vh; overflow: auto; border: 1px solid #d8dee8; border-radius: 16px; background: #fff; box-shadow: 0 24px 70px rgba(15, 23, 42, .22); }.memory-editor > header, .memory-editor > footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid #e8ebf0; }.memory-editor > footer { justify-content: flex-end; border-top: 1px solid #e8ebf0; border-bottom: 0; }.memory-editor header span { color: #667085; font-size: 9px; text-transform: uppercase; }.memory-editor header strong { display: block; margin-top: 2px; font-size: 16px; }.editor-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 16px; }.editor-grid label { display: grid; gap: 6px; color: #475467; font-size: 10px; font-weight: 650; }.editor-grid .wide, .isolation-toggle { grid-column: 1 / -1; }.editor-grid input, .editor-grid select, .editor-grid textarea { min-width: 0; padding: 9px 10px; border: 1px solid #d8dee8; border-radius: 9px; background: #fff; color: #172033; font: inherit; font-size: 11px; }.editor-grid textarea { resize: vertical; }.editor-grid input[readonly] { background: #f4f6f8; color: #667085; }.isolation-toggle { display: flex !important; grid-template-columns: 18px minmax(0, 1fr) !important; align-items: start; padding: 10px; border: 1px solid #dfe4ec; border-radius: 9px; }.isolation-toggle input { margin-top: 2px; }.isolation-toggle strong { display: block; font-size: 11px; }.isolation-toggle em { display: block; margin-top: 2px; color: #7b8494; font-size: 9px; font-style: normal; font-weight: 400; }
  .spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 980px) { .memory-layout { grid-template-columns: 1fr; }.archive-panel { position: static; }.memory-context { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 720px) { .memory-manager { padding: 12px; }.memory-toolbar { display: grid; }.memory-toolbar > div:last-child { justify-content: flex-start; }.memory-context { grid-template-columns: 1fr; }.entry-head { display: grid; }.memory-entry footer { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }.memory-entry footer .danger { grid-column: 1 / -1; }.editor-grid { grid-template-columns: 1fr; }.editor-grid .wide, .isolation-toggle { grid-column: auto; } }
</style>
