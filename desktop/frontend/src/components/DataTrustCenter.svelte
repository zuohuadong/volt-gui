<script lang="ts">
  import {
    AlertTriangle,
    Database,
    FolderLock,
    HardDrive,
    KeyRound,
    MessageSquareLock,
    Network,
    RefreshCw,
    Route,
    ShieldCheck,
  } from "@lucide/svelte";

  import {
    formatGovernanceTimestamp,
    sortTrustWarnings,
    trustStatusPresentation,
  } from "../lib/data-governance";
  import type { TrustCenterView, TrustFlow, TrustLocation } from "../lib/types";
  import ScrollToTop from "./ScrollToTop.svelte";

  interface Props {
    view?: TrustCenterView;
    loading: boolean;
    error: string;
    backendAvailable: boolean;
    onRefresh: () => void;
    onOpenMemory: () => void;
  }

  let {
    view,
    loading,
    error,
    backendAvailable,
    onRefresh,
    onOpenMemory,
  }: Props = $props();

  const warnings = $derived(sortTrustWarnings(view?.warnings ?? []));
  const contextItems = $derived([
    ["Workspace", view?.context.workspaceId || view?.context.workspaceRoot || "未绑定"],
    ["Project", view?.context.projectId || "未绑定"],
    ["Thread", view?.context.threadId || "未绑定"],
    ["Agent Profile", view?.context.agentProfileName || "未配置"],
    ["Model", view?.context.runtimeModel || "未配置"],
    ["Permission", view?.context.runtimePermission || "未配置"],
  ] as const);

  function destinationLabel(flow: TrustFlow): string {
    const targets = flow.destinations.map((destination) => destination.url || destination.host).filter(Boolean);
    return targets.length > 0 ? targets.join("\n") : "无固定目标";
  }

  function classificationLabel(value?: string): string {
    if (value === "local") return "本机";
    if (value === "intranet") return "内网";
    if (value === "external") return "外部";
    if (value === "mixed") return "混合";
    return "待确认";
  }

  function flowMeta(flow: TrustFlow): string[] {
    return [
      flow.apiSurface ? `API ${flow.apiSurface}` : "",
      flow.transport ? `传输 ${flow.transport}` : "",
      flow.runtime ? `运行时 ${flow.runtime}` : "",
      flow.provider ? `Provider ${flow.provider}` : "",
    ].filter(Boolean);
  }
</script>

{#snippet flowSection(title: string, subtitle: string, flows: TrustFlow[], icon: typeof Network)}
  {@const Icon = icon}
  <section class="trust-section">
    <header>
      <span class="section-icon"><Icon size={16} /></span>
      <div><strong>{title}</strong><p>{subtitle}</p></div>
      <em>{flows.length} 项</em>
    </header>
    <div class="trust-flow-list">
      {#each flows as flow (flow.id)}
        {@const status = trustStatusPresentation(flow.status)}
        <article class="trust-flow-row" data-testid="trust-flow-row">
          <div class="flow-heading">
            <span class={["status-badge", `status-${status.tone}`]} title={status.description}>{status.label}</span>
            <div><strong>{flow.name}</strong><p>{flow.direction || flow.detail || "当前未记录方向"}</p></div>
            <b>{classificationLabel(flow.classification)}</b>
          </div>
          {#if flowMeta(flow).length > 0}<div class="flow-tags">{#each flowMeta(flow) as item (item)}<span>{item}</span>{/each}</div>{/if}
          {#if flow.dataCategories.length > 0}
            <dl class="flow-data"><dt>可能涉及</dt><dd>{flow.dataCategories.join(" / ")}</dd></dl>
          {/if}
          <details>
            <summary>查看目标与说明</summary>
            <div class="flow-details">
              <dl><dt>目标</dt><dd class="path-value">{destinationLabel(flow)}</dd></dl>
              <dl><dt>说明</dt><dd>{flow.detail || status.description}</dd></dl>
              {#if flow.credential.env}<dl><dt>凭据引用</dt><dd><KeyRound size={13} /> {flow.credential.env} · {flow.credential.set ? "已设置" : "未设置"}</dd></dl>{/if}
            </div>
          </details>
        </article>
      {:else}
        <div class="section-empty">当前没有可展示的真实配置。</div>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet storageRow(location: TrustLocation)}
  {@const status = trustStatusPresentation(location.status)}
  <article class="storage-row">
    <div><strong>{location.name}</strong><p>{location.scope} · {location.retention}</p></div>
    <span class={["status-badge", `status-${status.tone}`]}>{location.exists ? "本机存在" : status.label}</span>
    <details>
      <summary>{location.sensitive ? "查看敏感路径" : "查看路径"}</summary>
      <code>{location.path || "未配置路径"}</code>
    </details>
  </article>
{/snippet}

<section class="trust-center" data-testid="trust-center">
  <header class="trust-toolbar">
    <div>
      <span>Data &amp; Trust</span>
      <strong>数据与信任中心</strong>
      <p>只展示当前 Thread 的真实配置和能力边界；“已配置”或“按需可能”不代表数据已经发送。</p>
    </div>
    <div>
      <button type="button" onclick={onOpenMemory}><Database size={14} /> 分层记忆</button>
      <button type="button" disabled={loading || !backendAvailable} onclick={onRefresh}><RefreshCw size={14} /> {loading ? "读取中" : "刷新"}</button>
    </div>
  </header>

  {#if !backendAvailable}
    <article class="trust-empty"><ShieldCheck size={28} /><strong>未连接桌面后端</strong><p>信任中心不生成预览数据。请在 Wails 桌面运行环境中查看当前 Thread 的真实数据路径和权限。</p></article>
  {:else if loading && !view}
    <article class="trust-empty"><span class="spin"><RefreshCw size={26} /></span><strong>正在读取当前 Thread</strong><p>正在汇总 Provider、存储、网络、文件外发和运行权限。</p></article>
  {:else if error && !view}
    <article class="trust-empty danger"><AlertTriangle size={28} /><strong>无法读取信任中心</strong><p>{error}</p><button type="button" onclick={onRefresh}>重新读取</button></article>
  {:else if view}
    {#if error}<div class="inline-alert"><AlertTriangle size={15} /> {error}</div>{/if}

    <section class="context-strip" aria-label="当前执行上下文">
      {#each contextItems as item (item[0])}<article><span>{item[0]}</span><strong title={item[1]}>{item[1]}</strong></article>{/each}
    </section>

    <div class="trust-meta-row">
      <span>生成时间：{formatGovernanceTimestamp(view.generatedAt)}</span>
      <span>记忆：{view.context.memoryScopes.length} 层 / {view.context.memorySourceIds.length} 来源</span>
      <span>更新时间：{formatGovernanceTimestamp(view.context.memoryUpdatedAt)}</span>
    </div>

    {#if warnings.length > 0}
      <section class="warning-stack" aria-label="风险提示">
        {#each warnings as warning (warning.id)}
          <article class={`warning-${warning.severity}`} data-testid="trust-warning">
            <AlertTriangle size={16} /><div><strong>{warning.title}</strong><p>{warning.detail}</p></div><span>{warning.severity === "high" ? "高风险" : warning.severity === "medium" ? "需关注" : "提示"}</span>
          </article>
        {/each}
      </section>
    {/if}

    <div class="trust-columns">
      <div>
        {@render flowSection("模型服务", "当前配置的模型请求目标和 API surface。", view.providers, Route)}
        {@render flowSection("网络与工具", "MCP、浏览器、Web、代理和沙箱联网边界。", view.network, Network)}
        {@render flowSection("文件外发", "只描述能力，不伪造已经发生的文件发送事件。", view.fileEgress, FolderLock)}
      </div>
      <div>
        <section class="trust-section">
          <header><span class="section-icon"><MessageSquareLock size={16} /></span><div><strong>企业 IM</strong><p>远端入口、准入范围、角色与控制服务。</p></div><em>{view.enterpriseIm.connections.length} 连接</em></header>
          <div class="im-summary">
            <div><span class={["status-badge", `status-${trustStatusPresentation(view.enterpriseIm.status).tone}`]}>{trustStatusPresentation(view.enterpriseIm.status).label}</span><strong>{view.enterpriseIm.runtimeStatus || "runtime 未运行"}</strong></div>
            <dl><dt>运行连接</dt><dd>{view.enterpriseIm.runtimeConnections}</dd><dt>允许所有用户</dt><dd>{view.enterpriseIm.allowAll ? "是" : "否"}</dd><dt>配对入口</dt><dd>{view.enterpriseIm.pairingEnabled ? "启用" : "关闭"}</dd><dt>审批者 / 管理员</dt><dd>{view.enterpriseIm.approverCount} / {view.enterpriseIm.adminCount}</dd><dt>控制服务</dt><dd>{view.enterpriseIm.control.enabled ? `${view.enterpriseIm.control.address || "已启用"} · ${view.enterpriseIm.control.tokenEnv || "无 Token 环境变量"} ${view.enterpriseIm.control.tokenSet ? "已设置" : "未设置"}` : "关闭"}</dd><dt>消息路径</dt><dd>{view.enterpriseIm.messagePath}</dd></dl>
          </div>
          {#each view.enterpriseIm.connections as connection (connection.id)}
            <details class="im-connection"><summary>{connection.label || connection.platform || connection.id}<span>{trustStatusPresentation(connection.status).label}</span></summary><dl><dt>平台 / 域</dt><dd>{connection.platform} / {connection.domain || "默认"}</dd><dt>用户 / 群组</dt><dd>{connection.userCount} / {connection.groupCount}</dd><dt>审批者 / 管理员</dt><dd>{connection.approverCount} / {connection.adminCount}</dd><dt>权限模式</dt><dd>{connection.toolApprovalMode}</dd><dt>Workspace</dt><dd class="path-value">{connection.workspaceRoots.join("\n") || "未绑定"}</dd></dl></details>
          {:else}<div class="section-empty">未配置企业 IM 连接。</div>{/each}
        </section>

        <section class="trust-section">
          <header><span class="section-icon"><HardDrive size={16} /></span><div><strong>本地存储</strong><p>真实文件位置和保留策略，路径默认折叠。</p></div><em>{view.storage.length} 处</em></header>
          <div class="storage-list">{#each view.storage as location (location.id)}{@render storageRow(location)}{/each}</div>
        </section>

        {@render flowSection("诊断与系统服务", "遥测、指标、崩溃、更新和本机通知。", view.diagnostics, ShieldCheck)}

        <section class="trust-section policy-section">
          <header><span class="section-icon"><ShieldCheck size={16} /></span><div><strong>权限与沙箱</strong><p>当前 Thread 的运行权限和本地边界。</p></div><em>{view.policy.runtimeToolApproval}</em></header>
          <dl class="policy-grid">
            <div><dt>Sandbox</dt><dd>{view.policy.sandboxMode}</dd></div>
            <div><dt>网络</dt><dd>{view.policy.sandboxNetwork ? "允许" : "隔离"}</dd></div>
            <div><dt>默认权限</dt><dd>{view.policy.defaultPermission}</dd></div>
            <div><dt>运行权限</dt><dd>{view.policy.runtimeToolApproval}</dd></div>
            <div><dt>输出净化</dt><dd>{view.policy.redactToolOutput ? "启用" : "关闭"}</dd></div>
            <div><dt>敏感文件保护</dt><dd>{view.policy.protectSensitiveFiles ? "启用" : "关闭"}</dd></div>
          </dl>
          <details class="policy-paths"><summary>查看读写路径与规则数量</summary><dl><dt>可写路径</dt><dd class="path-value">{view.policy.writeRoots.join("\n") || "无"}</dd><dt>禁止读取</dt><dd class="path-value">{view.policy.forbidReadRoots.join("\n") || "无"}</dd><dt>规则</dt><dd>允许 {view.policy.allowRuleCount} / 询问 {view.policy.askRuleCount} / 拒绝 {view.policy.denyRuleCount}</dd></dl></details>
        </section>
      </div>
    </div>
  {/if}
</section>

<ScrollToTop />

<style>
  .trust-center { display: grid; gap: 14px; min-width: 0; padding: 18px; color: #172033; }
  .trust-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 14px; border-bottom: 1px solid #e5e9f0; }
  .trust-toolbar > div:first-child { min-width: 0; }
  .trust-toolbar span { color: #667085; font-size: 10px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
  .trust-toolbar strong { display: block; margin-top: 3px; font-size: 20px; }
  .trust-toolbar p { max-width: 720px; margin: 6px 0 0; color: #667085; font-size: 12px; line-height: 1.6; }
  .trust-toolbar > div:last-child { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; padding: 0 11px; border: 1px solid #d8dee8; border-radius: 9px; background: #fff; color: #344054; font: inherit; font-size: 11px; font-weight: 650; cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .55; }
  .trust-empty { display: grid; justify-items: center; gap: 8px; min-height: 280px; align-content: center; padding: 30px; border: 1px dashed #cfd7e4; border-radius: 14px; background: #fbfcfe; text-align: center; }
  .trust-empty strong { font-size: 16px; }.trust-empty p { max-width: 560px; margin: 0; color: #667085; font-size: 12px; line-height: 1.6; }.trust-empty.danger { color: #b42318; }
  .inline-alert { display: flex; align-items: center; gap: 7px; padding: 10px 12px; border: 1px solid #f3c7c2; border-radius: 10px; background: #fff6f5; color: #9f2d20; font-size: 11px; }
  .context-strip { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 1px; overflow: hidden; border: 1px solid #dfe4ec; border-radius: 12px; background: #dfe4ec; }
  .context-strip article { min-width: 0; padding: 11px 12px; background: #fff; }.context-strip span { display: block; color: #7b8494; font-size: 9px; text-transform: uppercase; }.context-strip strong { display: block; margin-top: 4px; overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .trust-meta-row { display: flex; flex-wrap: wrap; gap: 8px 18px; color: #667085; font-size: 10px; }
  .warning-stack { display: grid; gap: 7px; }.warning-stack article { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; gap: 9px; align-items: start; padding: 11px 12px; border: 1px solid #e5e9f0; border-radius: 11px; background: #fff; }.warning-stack strong { font-size: 12px; }.warning-stack p { margin: 3px 0 0; color: #667085; font-size: 11px; line-height: 1.5; }.warning-stack span { font-size: 9px; font-weight: 750; }.warning-high { border-color: #efb8b1 !important; background: #fff7f6 !important; color: #a52b1e; }.warning-medium { border-color: #f0d49a !important; background: #fffaf0 !important; color: #9a5d00; }.warning-info { color: #315f9c; }
  .trust-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }.trust-columns > div { display: grid; gap: 12px; min-width: 0; }
  .trust-section { min-width: 0; overflow: hidden; border: 1px solid #dfe4ec; border-radius: 13px; background: #fff; }.trust-section > header { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 12px 13px; border-bottom: 1px solid #edf0f4; background: #fafbfc; }.section-icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: #eef3fa; color: #315f9c; }.trust-section header strong { font-size: 13px; }.trust-section header p { margin: 2px 0 0; color: #7b8494; font-size: 10px; }.trust-section header em { color: #667085; font-size: 9px; font-style: normal; }
  .trust-flow-list, .storage-list { display: grid; }.trust-flow-row, .storage-row { padding: 12px 13px; border-top: 1px solid #edf0f4; }.trust-flow-row:first-child, .storage-row:first-child { border-top: 0; }
  .flow-heading { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 9px; align-items: start; }.flow-heading strong { font-size: 12px; }.flow-heading p { margin: 3px 0 0; color: #667085; font-size: 10px; line-height: 1.45; }.flow-heading b { color: #667085; font-size: 9px; }.status-badge { display: inline-flex; align-items: center; min-height: 21px; padding: 0 7px; border-radius: 999px; font-size: 9px; font-weight: 750; white-space: nowrap; }.status-active { background: #eaf7ef; color: #187448; }.status-configured { background: #edf3fb; color: #315f9c; }.status-possible { background: #fff4dc; color: #925d00; }.status-disabled { background: #f1f3f5; color: #697386; }.status-unknown { background: #f5effa; color: #76528e; }
  .flow-tags { display: flex; flex-wrap: wrap; gap: 5px; margin: 9px 0 0 63px; }.flow-tags span { padding: 3px 6px; border-radius: 6px; background: #f3f5f8; color: #596273; font-size: 9px; }.flow-data { display: grid; grid-template-columns: 60px minmax(0, 1fr); margin: 8px 0 0 63px; font-size: 10px; }.flow-data dt { color: #7b8494; }.flow-data dd { margin: 0; color: #344054; }
  details { margin-top: 8px; }.trust-flow-row details { margin-left: 63px; } summary { color: #315f9c; font-size: 10px; cursor: pointer; }.flow-details, .im-connection dl, .policy-paths dl { display: grid; gap: 7px; margin-top: 8px; padding: 9px; border-radius: 8px; background: #f7f9fb; }.flow-details dl, .im-connection dl { margin: 0; }.flow-details dt, .im-connection dt, .policy-paths dt { color: #7b8494; font-size: 9px; }.flow-details dd, .im-connection dd, .policy-paths dd { display: flex; align-items: center; gap: 5px; margin: 2px 0 0; color: #344054; font-size: 10px; line-height: 1.45; }.path-value { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
  .section-empty { padding: 18px; color: #7b8494; font-size: 11px; text-align: center; }.storage-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }.storage-row strong { font-size: 11px; }.storage-row p { margin: 3px 0 0; color: #7b8494; font-size: 9px; line-height: 1.45; }.storage-row details { grid-column: 1 / -1; }.storage-row code { display: block; margin-top: 7px; padding: 8px; border-radius: 7px; background: #f4f6f8; color: #475467; font-size: 9px; overflow-wrap: anywhere; }
  .im-summary { padding: 12px 13px; }.im-summary > div { display: flex; align-items: center; gap: 8px; }.im-summary > div strong { font-size: 11px; }.im-summary dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 5px 10px; margin: 10px 0 0; font-size: 10px; }.im-summary dt { color: #7b8494; }.im-summary dd { margin: 0; }.im-connection { margin: 0; padding: 10px 13px; border-top: 1px solid #edf0f4; }.im-connection summary { display: flex; justify-content: space-between; gap: 8px; color: #344054; font-weight: 650; }.im-connection summary span { color: #667085; font-size: 9px; }
  .policy-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; margin: 0; background: #edf0f4; }.policy-grid div { padding: 10px 11px; background: #fff; }.policy-grid dt { color: #7b8494; font-size: 9px; }.policy-grid dd { margin: 3px 0 0; font-size: 11px; font-weight: 700; }.policy-paths { margin: 0; padding: 11px 13px; border-top: 1px solid #edf0f4; }
  .spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 1120px) { .context-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); }.trust-columns { grid-template-columns: 1fr; } }
  @media (max-width: 720px) { .trust-center { padding: 12px; }.trust-toolbar { display: grid; }.trust-toolbar > div:last-child { justify-content: flex-start; }.context-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }.warning-stack article { grid-template-columns: 18px minmax(0, 1fr); }.warning-stack article > span { grid-column: 2; }.flow-heading { grid-template-columns: auto minmax(0, 1fr); }.flow-heading b { grid-column: 2; }.flow-tags, .flow-data, .trust-flow-row details { margin-left: 0; }.policy-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
