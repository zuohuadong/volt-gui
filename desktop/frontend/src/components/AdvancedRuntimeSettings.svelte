<script lang="ts">
  import { onMount } from "svelte";
  import { Check, CirclePlus, RefreshCw, ShieldCheck, Trash2, Wrench } from "@lucide/svelte";
  import { app } from "../lib/bridge";
  import type { HookConfigView, HooksSettingsView, ModelInfo, PluginView, SettingsView } from "../lib/types";

  let {
    available,
    models = [],
  }: {
    available: boolean;
    models?: ModelInfo[];
  } = $props();

  let settings = $state.raw<SettingsView>();
  let hooksView = $state.raw<HooksSettingsView>();
  let pluginPackages = $state.raw<PluginView[]>([]);
  let hookDrafts = $state<HookConfigView[]>([]);
  let hookScope = $state<"global" | "project">("global");
  let subagentModel = $state("");
  let subagentEffort = $state("auto");
  let maxSubagentDepth = $state(1);
  let maxSubagentConcurrency = $state(6);
  let pluginSource = $state("");
  let operationOutput = $state("");
  let operationError = $state("");
  let busyAction = $state("");

  const modelOptions = $derived.by(() => {
    const options = models.map((model) => ({
      value: model.ref || model.name || model.model || model.label || "",
      label: model.label || model.model || model.name || model.ref || "未命名模型",
    })).filter((model) => model.value);
    if (subagentModel && !options.some((model) => model.value === subagentModel)) {
      options.unshift({ value: subagentModel, label: `${subagentModel}（当前配置）` });
    }
    return options;
  });

  onMount(() => {
    if (available) void refreshAll();
  });

  function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  function beginAction(action: string) {
    busyAction = action;
    operationError = "";
    operationOutput = "";
  }

  function finishAction() {
    busyAction = "";
  }

  async function refreshAll() {
    beginAction("refresh");
    try {
      await Promise.all([refreshSettings(), refreshHooks(), refreshPlugins()]);
      operationOutput = "运行配置已刷新。";
    } catch (error) {
      operationError = `读取运行配置失败：${errorMessage(error)}`;
    } finally {
      finishAction();
    }
  }

  async function refreshSettings() {
    const next = await app().Settings();
    settings = next;
    subagentModel = next.subagentModel || "";
    subagentEffort = next.subagentEffort || "auto";
    maxSubagentDepth = next.agent?.maxSubagentDepth === 2 ? 2 : 1;
    maxSubagentConcurrency = Math.min(32, Math.max(1, next.agent?.maxSubagentConcurrency ?? 6));
  }

  async function refreshHooks() {
    const next = await app().HooksSettings(hookScope);
    hooksView = next;
    hookDrafts = next.hooks.map((hook) => ({ ...hook }));
  }

  async function refreshPlugins() {
    pluginPackages = await app().Plugins();
  }

  async function saveSubagentDefaults() {
    beginAction("subagents");
    try {
      await app().SetSubagentModel(subagentModel);
      await app().SetSubagentEffort(subagentEffort);
      await app().SetMaxSubagentDepth(maxSubagentDepth);
      await app().SetMaxSubagentConcurrency(maxSubagentConcurrency);
      await refreshSettings();
      operationOutput = "子代理默认配置已保存，新会话或运行时重建后生效。";
    } catch (error) {
      operationError = `保存子代理配置失败：${errorMessage(error)}`;
    } finally {
      finishAction();
    }
  }

  async function selectHookScope(scope: "global" | "project") {
    hookScope = scope;
    beginAction("hooks-load");
    try {
      await refreshHooks();
    } catch (error) {
      operationError = `读取 Hook 配置失败：${errorMessage(error)}`;
    } finally {
      finishAction();
    }
  }

  function addHook() {
    hookDrafts.push({
      event: hooksView?.events[0] || "pre_tool_use",
      command: "",
      timeout: 30,
    });
  }

  function removeHook(index: number) {
    hookDrafts.splice(index, 1);
  }

  async function saveHooks() {
    beginAction("hooks-save");
    try {
      await app().SaveHooksSettings(hookScope, hookDrafts);
      await refreshHooks();
      operationOutput = `${hookScope === "project" ? "项目" : "全局"} Hook 已保存。`;
    } catch (error) {
      operationError = `保存 Hook 失败：${errorMessage(error)}`;
    } finally {
      finishAction();
    }
  }

  async function trustProjectHooks() {
    beginAction("hooks-trust");
    try {
      await app().TrustProjectHooks();
      await refreshHooks();
      operationOutput = "当前项目 Hook 已加入本机信任。";
    } catch (error) {
      operationError = `信任项目 Hook 失败：${errorMessage(error)}`;
    } finally {
      finishAction();
    }
  }

  async function planPluginInstall() {
    const source = pluginSource.trim();
    if (!source) return;
    beginAction("plugin-plan");
    try {
      operationOutput = await app().PlanPluginInstall(source, { dryRun: true });
    } catch (error) {
      operationError = `插件预检失败：${errorMessage(error)}`;
    } finally {
      finishAction();
    }
  }

  async function installPlugin() {
    const source = pluginSource.trim();
    if (!source) return;
    beginAction("plugin-install");
    try {
      operationOutput = await app().InstallPlugin(source, {});
      pluginSource = "";
      await refreshPlugins();
    } catch (error) {
      operationError = `安装插件失败：${errorMessage(error)}`;
    } finally {
      finishAction();
    }
  }

  async function setPluginEnabled(plugin: PluginView, enabled: boolean) {
    beginAction(`plugin-toggle:${plugin.name}`);
    try {
      await app().SetPluginEnabled(plugin.name, enabled);
      await refreshPlugins();
      operationOutput = `${plugin.name} 已${enabled ? "启用" : "停用"}。`;
    } catch (error) {
      operationError = `更新插件状态失败：${errorMessage(error)}`;
    } finally {
      finishAction();
    }
  }

  async function runPluginDoctor(plugin: PluginView) {
    beginAction(`plugin-doctor:${plugin.name}`);
    try {
      const diagnosis = await app().PluginDoctor(plugin.name);
      operationOutput = diagnosis.error || diagnosis.warnings?.join("\n") || `${plugin.name} 检查通过。`;
    } catch (error) {
      operationError = `插件诊断失败：${errorMessage(error)}`;
    } finally {
      finishAction();
    }
  }

  async function updatePlugin(plugin: PluginView) {
    beginAction(`plugin-update:${plugin.name}`);
    try {
      operationOutput = await app().UpdatePlugin(plugin.name);
      await refreshPlugins();
    } catch (error) {
      operationError = `更新插件失败：${errorMessage(error)}`;
    } finally {
      finishAction();
    }
  }

  async function removePlugin(plugin: PluginView) {
    if (!window.confirm(`移除插件 ${plugin.name}？本地插件状态会更新，运行时将重建。`)) return;
    beginAction(`plugin-remove:${plugin.name}`);
    try {
      await app().RemovePlugin(plugin.name);
      await refreshPlugins();
      operationOutput = `${plugin.name} 已移除。`;
    } catch (error) {
      operationError = `移除插件失败：${errorMessage(error)}`;
    } finally {
      finishAction();
    }
  }
</script>

<div class="runtime-settings">
  {#if !available}
    <div class="runtime-settings__notice">未连接 Wails 桌面后端，运行配置保持只读。</div>
  {:else}
    <div class="runtime-settings__toolbar">
      <p>这些配置直接写入 Volt 运行时，不使用浏览器模拟状态。</p>
      <button type="button" disabled={Boolean(busyAction)} onclick={() => void refreshAll()}>
        <RefreshCw size={14} /> 刷新
      </button>
    </div>

    {#if operationError}<div class="runtime-settings__alert error">{operationError}</div>{/if}
    {#if operationOutput}<pre class="runtime-settings__alert success">{operationOutput}</pre>{/if}

    <section>
      <header><div><strong>子代理默认配置</strong><p>配置内置 subagent 的模型、推理强度、委派深度和并行任务上限。</p></div><span>{settings?.subagentModel || "继承默认模型"}</span></header>
      <div class="runtime-settings__form three-columns">
        <label>默认模型
          <select bind:value={subagentModel}>
            <option value="">继承会话默认模型</option>
            {#each modelOptions as model (model.value)}<option value={model.value}>{model.label}</option>{/each}
          </select>
        </label>
        <label>推理强度
          <select bind:value={subagentEffort}>
            <option value="auto">自动</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="max">Max</option>
          </select>
        </label>
        <label>最大委派深度
          <select bind:value={maxSubagentDepth}><option value={1}>1 层</option><option value={2}>2 层</option></select>
        </label>
        <label>并行子代理上限
          <input type="number" min="1" max="32" bind:value={maxSubagentConcurrency} />
        </label>
      </div>
      <p class="runtime-settings__hint">当前限制会约束 parallel_tasks 的并发子任务；写入型 profile fleet 仍保持关闭，避免在未移植路径声明和冲突检测前制造并行写入。</p>
      <footer><button class="primary" type="button" disabled={Boolean(busyAction)} onclick={() => void saveSubagentDefaults()}>{busyAction === "subagents" ? "保存中" : "保存子代理配置"}</button></footer>
    </section>

    <section>
      <header><div><strong>Hook 治理</strong><p>编辑全局或项目级事件命令；项目 Hook 必须显式信任后才会执行。</p></div><span>{hooksView?.path || "未选择项目"}</span></header>
      <div class="runtime-settings__segments" role="group" aria-label="Hook 配置范围">
        <button class={{ active: hookScope === "global" }} type="button" onclick={() => void selectHookScope("global")}>全局</button>
        <button class={{ active: hookScope === "project" }} type="button" onclick={() => void selectHookScope("project")}>当前项目</button>
      </div>
      {#if hookScope === "project" && hooksView && !hooksView.projectRoot}
        <div class="runtime-settings__empty">当前不是项目会话，无法编辑项目级 Hook。</div>
      {:else}
        <div class="hook-list">
          {#each hookDrafts as hook, index (`${index}:${hook.event}`)}
            <article>
              <select aria-label="Hook 事件" bind:value={hook.event}>{#each hooksView?.events ?? [] as event (event)}<option value={event}>{event}</option>{/each}</select>
              <input aria-label="Hook 命令" bind:value={hook.command} placeholder="执行命令" />
              <input aria-label="Hook 匹配条件" bind:value={hook.match} placeholder="匹配条件（可选）" />
              <button class="icon" type="button" aria-label="删除 Hook" onclick={() => removeHook(index)}><Trash2 size={14} /></button>
            </article>
          {:else}
            <div class="runtime-settings__empty">暂无 Hook。添加后保存才会写入配置。</div>
          {/each}
        </div>
        <footer>
          <button type="button" onclick={addHook}><CirclePlus size={14} /> 添加 Hook</button>
          {#if hookScope === "project" && hooksView && !hooksView.trusted}<button type="button" disabled={Boolean(busyAction)} onclick={() => void trustProjectHooks()}><ShieldCheck size={14} /> 信任当前项目</button>{/if}
          <button class="primary" type="button" disabled={Boolean(busyAction)} onclick={() => void saveHooks()}>保存 Hook</button>
        </footer>
      {/if}
    </section>

    <section>
      <header><div><strong>插件包管理</strong><p>先预检来源与能力清单，再安装、启停、更新或诊断本地插件包。</p></div><span>{pluginPackages.length} 个</span></header>
      <div class="plugin-install-row">
        <input bind:value={pluginSource} aria-label="插件来源" placeholder="本地目录、压缩包或受支持的仓库来源" />
        <button type="button" disabled={!pluginSource.trim() || Boolean(busyAction)} onclick={() => void planPluginInstall()}><Wrench size={14} /> 预检</button>
        <button class="primary" type="button" disabled={!pluginSource.trim() || Boolean(busyAction)} onclick={() => void installPlugin()}>{busyAction === "plugin-install" ? "安装中" : "安装"}</button>
      </div>
      <div class="plugin-list">
        {#each pluginPackages as plugin (plugin.name)}
          <article>
            <div><strong>{plugin.name}</strong><p>{plugin.description || plugin.source || plugin.root}</p><span>{plugin.version || "本地"} · {plugin.skills} Skill / {plugin.hooks} Hook / {plugin.mcpServers} MCP</span></div>
            <label class="plugin-toggle"><input type="checkbox" checked={plugin.enabled} disabled={Boolean(busyAction) || Boolean(plugin.error)} onchange={(event) => void setPluginEnabled(plugin, event.currentTarget.checked)} /><span>{plugin.enabled ? "已启用" : "已停用"}</span></label>
            <div class="plugin-actions">
              <button type="button" disabled={Boolean(busyAction)} onclick={() => void runPluginDoctor(plugin)}><Check size={13} /> 诊断</button>
              <button type="button" disabled={Boolean(busyAction) || !plugin.source} onclick={() => void updatePlugin(plugin)}>更新</button>
              <button class="danger" type="button" disabled={Boolean(busyAction)} onclick={() => void removePlugin(plugin)}>移除</button>
            </div>
          </article>
        {:else}
          <div class="runtime-settings__empty">暂无已安装插件包。可先输入来源并运行预检。</div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .runtime-settings { display: grid; gap: 12px; }
  .runtime-settings__toolbar, section > header, section > footer, .plugin-install-row, .plugin-actions, .runtime-settings__segments { display: flex; align-items: center; gap: 8px; }
  .runtime-settings__toolbar, section > header { justify-content: space-between; }
  .runtime-settings__toolbar p, section p { margin: 0; color: var(--fg-muted, #687169); font-size: 12px; line-height: 1.5; }
  section { display: grid; gap: 12px; padding: 14px; border: 1px solid var(--border, #dce1db); border-radius: 10px; background: var(--surface, #fff); }
  section > header { align-items: flex-start; }
  section > header strong { display: block; margin-bottom: 3px; color: var(--fg, #1f2421); font-size: 13px; }
  section > header > span { max-width: 46%; overflow: hidden; color: var(--fg-faint, #89918b); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  button, input, select { min-height: 34px; border: 1px solid var(--border, #dce1db); border-radius: 7px; background: var(--surface, #fff); color: var(--fg, #1f2421); font: inherit; }
  button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; cursor: pointer; }
  button.primary { border-color: var(--primary, #0f7b55); background: var(--primary, #0f7b55); color: #fff; }
  button.danger { color: var(--danger, #b42318); }
  button.icon { width: 34px; padding: 0; }
  button:disabled, input:disabled, select:disabled { cursor: not-allowed; opacity: .52; }
  input, select { min-width: 0; padding: 0 9px; }
  .runtime-settings__form { display: grid; gap: 10px; }
  .three-columns { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .runtime-settings__form label { display: grid; gap: 5px; color: var(--fg-muted, #687169); font-size: 11px; }
  .runtime-settings__segments button.active { border-color: var(--primary, #0f7b55); background: var(--accent-soft, #e7f5ef); color: var(--primary, #0f7b55); }
  .hook-list, .plugin-list { display: grid; gap: 8px; }
  .hook-list article { display: grid; grid-template-columns: 150px minmax(180px, 1.4fr) minmax(150px, 1fr) 34px; gap: 7px; }
  .plugin-install-row input { flex: 1; }
  .plugin-list article { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 11px; border-top: 1px solid var(--border, #dce1db); }
  .plugin-list article:first-child { border-top: 0; }
  .plugin-list strong, .plugin-list p, .plugin-list span { display: block; }
  .plugin-list span { margin-top: 4px; color: var(--fg-faint, #89918b); font-size: 11px; }
  .plugin-toggle { display: flex; align-items: center; gap: 6px; font-size: 11px; white-space: nowrap; }
  .plugin-toggle input { min-height: 0; }
  .plugin-actions button { min-height: 30px; padding: 0 8px; font-size: 11px; }
  .runtime-settings__alert, .runtime-settings__notice, .runtime-settings__empty { margin: 0; padding: 10px 11px; border-radius: 8px; color: var(--fg-muted, #687169); background: var(--surface-muted, #edf0ec); font: inherit; font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
  .runtime-settings__alert.error { color: var(--danger, #b42318); background: var(--danger-soft, #fdecea); }
  .runtime-settings__alert.success { color: var(--primary, #0f7b55); background: var(--accent-soft, #e7f5ef); }

  @media (max-width: 760px) {
    .three-columns { grid-template-columns: 1fr; }
    .hook-list article { grid-template-columns: 1fr 34px; }
    .hook-list article input { grid-column: 1 / -1; }
    .plugin-install-row, .plugin-list article { align-items: stretch; flex-direction: column; grid-template-columns: 1fr; }
    .plugin-actions { flex-wrap: wrap; }
    .plugin-actions button { flex: 1; }
  }
</style>
