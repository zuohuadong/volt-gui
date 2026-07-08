<script lang="ts">
  import { onMount } from "svelte";
  import { BrainCircuit, Check, ChevronDown, HelpCircle, LoaderCircle, ShieldAlert, Terminal, Wrench, X } from "@lucide/svelte";
  import MarkdownView from "./MarkdownView.svelte";
  import type { QuestionAnswer, TranscriptItem, WireApproval, WireAsk } from "../lib/types";

  let {
    items,
    loading,
    sending,
    approval,
    ask,
    onApprove,
    onAnswerAsk,
    onDismissAsk,
  }: {
    items: TranscriptItem[];
    loading: boolean;
    sending: boolean;
    approval?: WireApproval;
    ask?: WireAsk;
    onApprove: (allow: boolean, session: boolean, persist: boolean) => void;
    onAnswerAsk: (answers: QuestionAnswer[]) => void;
    onDismissAsk: () => void;
  } = $props();

  let selectedAnswer = $state("");
  let selectedAskId = $state("");
  let nowMs = $state(Date.now());

  const question = $derived(ask?.questions[0]);
  const askAnswer = $derived(question ? [{ questionId: question.id, selected: selectedAnswer ? [selectedAnswer] : [] }] : []);
  const subcallsByParent = $derived.by(() => {
    const grouped = new Map<string, TranscriptItem[]>();
    for (const item of items) {
      if (item.role !== "tool" || !item.parentId) continue;
      const children = grouped.get(item.parentId) ?? [];
      children.push(item);
      grouped.set(item.parentId, children);
    }
    return grouped;
  });
  const visibleItems = $derived(
    items.filter((item) => item.role !== "system" && (item.title ?? "").toLowerCase() !== "usage" && !item.id.startsWith("usage-")),
  );

  $effect(() => {
    if ((ask?.id ?? "") !== selectedAskId) {
      selectedAskId = ask?.id ?? "";
      selectedAnswer = "";
    }
  });

  onMount(() => {
    const timer = window.setInterval(() => {
      nowMs = Date.now();
    }, 1000);
    return () => window.clearInterval(timer);
  });

  function isRawAskPayload(item: TranscriptItem) {
    if ((item.title ?? "").toLowerCase() !== "ask") return false;
    try {
      const parsed = JSON.parse(item.body);
      return Array.isArray(parsed?.questions);
    } catch {
      return false;
    }
  }

  function extractLeadingJsonObject(value: string) {
    const start = value.search(/\S/);
    if (start < 0 || value[start] !== "{") return undefined;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < value.length; index += 1) {
      const char = value[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }
      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return { json: value.slice(start, index + 1), rest: value.slice(index + 1) };
        }
      }
    }
    return undefined;
  }

  function isMarkdownPath(path: string) {
    return /\.(md|mdx|markdown)$/i.test(path.trim());
  }

  function markdownWriteResult(item: TranscriptItem) {
    if (item.role !== "tool" || (item.title ?? "").toLowerCase() !== "write_file") return undefined;
    const extracted = extractLeadingJsonObject(item.body);
    if (!extracted) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(extracted.json);
    } catch {
      return undefined;
    }
    if (!parsed || typeof parsed !== "object") return undefined;
    const record = parsed as Record<string, unknown>;
    const content = typeof record.content === "string" ? record.content : "";
    const path = typeof record.path === "string" ? record.path : "";
    if (!content || !isMarkdownPath(path)) return undefined;
    const result = /(?:^|\n)\s*wrote\s+(\d+)\s+bytes\s+to\s+(.+?)\s*$/i.exec(extracted.rest);
    if (!result) return undefined;
    return { content, path, bytes: result[1], writtenPath: result[2] };
  }

  function parseLeadingToolArgs(item: TranscriptItem) {
    const extracted = extractLeadingJsonObject(item.body);
    if (!extracted) return { args: undefined as Record<string, unknown> | undefined, output: item.body.trim() };
    try {
      const parsed = JSON.parse(extracted.json);
      const args = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : undefined;
      return { args, output: extracted.rest.trim() };
    } catch {
      return { args: undefined as Record<string, unknown> | undefined, output: item.body.trim() };
    }
  }

  function shortToolName(name: string) {
    return name.replace(/^functions\./, "").replace(/^tool_/, "").replace(/_/g, " ").trim() || "工具";
  }

  function commandAction(command: string) {
    const normalized = command.toLowerCase();
    if (normalized.includes("git status")) return "检查仓库状态";
    if (normalized.includes("git diff")) return "查看代码差异";
    if (normalized.includes("git log")) return "读取最近提交";
    if (normalized.includes("git show")) return "查看提交内容";
    if (/\brg\b|ripgrep/.test(normalized)) return "搜索代码内容";
    if (normalized.includes("pnpm") || normalized.includes("npm run") || normalized.includes("yarn")) return "运行前端检查";
    if (normalized.includes("go test")) return "运行 Go 测试";
    if (normalized.includes("go build")) return "构建桌面模块";
    return "执行终端命令";
  }

  function compactCommand(command: string) {
    return command.replace(/\s+/g, " ").trim();
  }

  function toolDisplay(item: TranscriptItem) {
    const name = item.title ?? "tool";
    const { args, output } = parseLeadingToolArgs(item);
    const command = typeof args?.command === "string" ? args.command : "";
    const path = typeof args?.path === "string" ? args.path : typeof args?.file === "string" ? args.file : "";
    const query = typeof args?.query === "string" ? args.query : typeof args?.pattern === "string" ? args.pattern : "";
    const fallback = shortToolName(name);
    const action = command ? commandAction(command) : path ? `${fallback}文件` : query ? `${fallback}：${query}` : fallback;
    const detail = command ? compactCommand(command) : path || query || "";
    const status = item.pending ? "正在执行" : output ? "已完成" : "已记录";
    return {
      action,
      detail,
      output,
      status,
      tool: shortToolName(name),
      readOnly: item.readOnly,
    };
  }

  function pendingLabel(item: TranscriptItem) {
    if (item.role === "tool") return "正在执行工具";
    if (item.role === "reasoning") return "正在整理思路";
    return "正在思考";
  }

  function pendingElapsedMs(item: TranscriptItem) {
    return Math.max(0, nowMs - (item.createdAtMs ?? nowMs));
  }

  function pendingElapsedLabel(item: TranscriptItem) {
    const seconds = Math.floor(pendingElapsedMs(item) / 1000);
    if (seconds < 60) return `已等待 ${Math.max(1, seconds)} 秒`;
    return `已等待 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
  }

  function isLikelyStalled(item: TranscriptItem) {
    return pendingElapsedMs(item) >= 120000;
  }
</script>

<section class="transcript" aria-busy={sending || loading}>
  {#each visibleItems as item (item.id)}
    {#if !(item.role === "tool" && item.parentId) && !isRawAskPayload(item)}
      <article class={`message message--${item.role}${item.pending ? " is-pending" : ""}`} data-tool-id={item.role === "tool" ? item.id : undefined}>
        {#if item.pending && !item.body.trim()}
          <div class="pending-status" role="status" aria-live="polite">
            <LoaderCircle size={15} />
            <strong>{pendingLabel(item)}</strong>
            <em>{pendingElapsedLabel(item)} · {isLikelyStalled(item) ? "可能卡住了，可点击停止后重试" : "结果会自动显示"}</em>
          </div>
        {:else if item.role === "tool"}
          {@const tool = toolDisplay(item)}
          <details class="thinking-card tool-call-card" open={item.pending}>
            <summary>
              <span class="thinking-card__icon"><Terminal size={16} /></span>
              <div>
                <strong>{tool.action}</strong>
                <em>{tool.tool}{item.pending ? " · 正在执行" : ""}</em>
              </div>
              <ChevronDown class="thinking-card__chevron" size={16} />
            </summary>
            <div class="thinking-card__body">
              <div class="thinking-step">
                <span></span>
                <div>
                  <strong>Thought</strong>
                  <p>{tool.action}{tool.readOnly ? " · 只读" : ""}</p>
                  {#if tool.detail}<code>{tool.detail}</code>{/if}
                  {#if tool.output}<pre>{tool.output}</pre>{/if}
                </div>
              </div>
            </div>
          </details>
        {:else if item.role === "reasoning"}
          <details class="thinking-card reasoning-card" open={item.pending}>
            <summary>
              <span class="thinking-card__icon"><BrainCircuit size={16} /></span>
              <div>
                <strong>思考过程</strong>
              </div>
              <ChevronDown class="thinking-card__chevron" size={16} />
            </summary>
            <div class="thinking-card__body">
              <div class="thinking-step">
                <span></span>
                <div>
                  <MarkdownView text={item.body} />
                </div>
              </div>
            </div>
          </details>
        {:else}
          {@const renderedWrite = markdownWriteResult(item)}
          {#if renderedWrite}
            <div class="tool-document-result">
              <MarkdownView text={renderedWrite.content} />
              <footer>
                <strong>已写入 Markdown 文件</strong>
                <span>{renderedWrite.bytes} bytes</span>
                <code>{renderedWrite.writtenPath || renderedWrite.path}</code>
              </footer>
            </div>
          {:else}
            <MarkdownView text={item.body} />
            {#if item.pending && item.role === "assistant"}
              <div class="pending-inline-status" role="status" aria-live="polite">
                <LoaderCircle size={13} />
                <span>{isLikelyStalled(item) ? "处理时间较长" : "正在继续处理"}</span>
                <em>{pendingElapsedLabel(item)} · {isLikelyStalled(item) ? "可点击停止后重试" : "后续内容会自动更新"}</em>
              </div>
            {/if}
          {/if}
        {/if}
        {#if item.role === "tool" && subcallsByParent.get(item.id)?.length}
          <div class="tool-subcalls" aria-label={`Subcalls for ${item.title || item.id}`}>
            {#each subcallsByParent.get(item.id) ?? [] as child (child.id)}
              <article class={`message message--tool message--subtool${child.pending ? " is-pending" : ""}`} data-parent-tool-id={item.id}>
                {#if child.pending && !child.body.trim()}
                  <div class="pending-status pending-status--compact" role="status" aria-live="polite">
                    <LoaderCircle size={14} />
                    <strong>{pendingLabel(child)}</strong>
                  </div>
                {:else if child.role === "tool"}
                  {@const childTool = toolDisplay(child)}
                  <details class="thinking-card tool-call-card tool-call-card--sub" open={child.pending}>
                    <summary>
                      <span class="thinking-card__icon"><Wrench size={15} /></span>
                      <div>
                        <strong>{childTool.action}</strong>
                        <em>{childTool.tool}{child.pending ? " · 正在执行" : ""}</em>
                      </div>
                      <ChevronDown class="thinking-card__chevron" size={15} />
                    </summary>
                    <div class="thinking-card__body">
                      <div class="thinking-step">
                        <span></span>
                        <div>
                          <strong>Thought</strong>
                          <p>{childTool.action}{childTool.readOnly ? " · 只读" : ""}</p>
                          {#if childTool.detail}<code>{childTool.detail}</code>{/if}
                          {#if childTool.output}<pre>{childTool.output}</pre>{/if}
                        </div>
                      </div>
                    </div>
                  </details>
                {:else}
                  {@const renderedChildWrite = markdownWriteResult(child)}
                  {#if renderedChildWrite}
                    <div class="tool-document-result">
                      <MarkdownView text={renderedChildWrite.content} />
                      <footer>
                        <strong>已写入 Markdown 文件</strong>
                        <span>{renderedChildWrite.bytes} bytes</span>
                        <code>{renderedChildWrite.writtenPath || renderedChildWrite.path}</code>
                      </footer>
                    </div>
                  {:else}
                    <MarkdownView text={child.body} />
                  {/if}
                {/if}
              </article>
            {/each}
          </div>
        {/if}
      </article>
    {/if}
  {/each}

  {#if approval}
    <article class="decision-shelf">
      <div>
        <ShieldAlert size={18} />
        <strong>{approval.tool === "exit_plan_mode" ? "Plan approval" : "Tool approval"}</strong>
        <span>{approval.tool}</span>
      </div>
      {#if approval.subject}
        <pre>{approval.subject}</pre>
      {/if}
      <div class="decision-actions">
        <button type="button" onclick={() => onApprove(true, false, false)}><Check size={14} /> Allow once</button>
        <button type="button" onclick={() => onApprove(true, true, false)}>Allow session</button>
        <button type="button" onclick={() => onApprove(true, true, true)}>Persist</button>
        <button type="button" onclick={() => onApprove(false, false, false)}><X size={14} /> Deny</button>
      </div>
    </article>
  {/if}

  {#if ask && question}
    <article class="decision-shelf decision-shelf--ask">
      <div class="decision-shelf__head">
        <span class="decision-shelf__icon"><HelpCircle size={18} /></span>
        <div>
          <strong>{question.header || "需要确认"}</strong>
          <span>{question.prompt}</span>
        </div>
      </div>
      <div class="answer-grid">
        {#each question.options as option (option.label)}
          <button class={selectedAnswer === option.label ? "is-active" : ""} type="button" onclick={() => (selectedAnswer = option.label)}>
            <strong>{option.label}</strong>
            {#if option.description}<span>{option.description}</span>{/if}
          </button>
        {/each}
      </div>
      <div class="decision-actions">
        <button type="button" disabled={!selectedAnswer} onclick={() => onAnswerAsk(askAnswer)}>提交选择</button>
        <button type="button" onclick={onDismissAsk}>稍后处理</button>
      </div>
    </article>
  {/if}
</section>

<style>
  .transcript {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: min(100%, 1080px);
    margin: 0 auto;
  }

  .message,
  .decision-shelf {
    max-width: min(100%, 1080px);
    border: 1px solid #e7e9ee;
    border-radius: 12px;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
  }

  .message {
    padding: 18px 20px;
  }

  .message--user {
    align-self: flex-end;
    max-width: min(640px, 78%);
    padding: 12px 16px;
    background: #f7f7f8;
  }

  .message--system,
  .message--notice,
  .message--reasoning,
  .message--tool {
    background: #f8fafc;
  }

  .message--reasoning,
  .message--tool {
    border: 0;
    background: transparent;
    box-shadow: none;
    padding: 0 0 0 22px;
  }

  .message.is-pending {
    border-color: #dfe5f2;
    background: #fbfcff;
  }

  .message--reasoning.is-pending,
  .message--tool.is-pending {
    border-color: transparent;
    background: transparent;
  }

  .pending-status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    color: #334155;
    font-size: 14px;
    line-height: 1.4;
  }

  .pending-status :global(svg) {
    flex: 0 0 auto;
    color: #5b7ee5;
    animation: pending-spin 1s linear infinite;
  }

  .pending-status strong {
    font-weight: 500;
  }

  .pending-status em {
    color: #8b8f98;
    font-size: 13px;
    font-style: normal;
  }

  .pending-status--compact {
    font-size: 13px;
  }

  .pending-inline-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    min-height: 24px;
    padding: 4px 8px;
    border-radius: 7px;
    background: #f4f6f8;
    color: #5f6673;
    font-size: 12px;
    line-height: 1.35;
  }

  .pending-inline-status :global(svg) {
    flex: 0 0 auto;
    color: #64748b;
    animation: pending-spin 1s linear infinite;
  }

  .pending-inline-status span {
    font-weight: 500;
  }

  .pending-inline-status em {
    color: #858b95;
    font-size: 11px;
    font-style: normal;
  }

  .tool-document-result {
    display: grid;
    gap: 12px;
  }

  .tool-document-result :global(.md) {
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .tool-document-result footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid #e2e8f0;
    color: #64748b;
    font-size: 12px;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .tool-document-result footer strong {
    color: #334155;
    font-weight: 650;
  }

  .tool-document-result footer span {
    color: #64748b;
  }

  .tool-document-result footer code {
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
    padding: 2px 6px;
    border: 1px solid #dbe3ee;
    border-radius: 6px;
    background: #ffffff;
    color: #475569;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
  }

  .thinking-card {
    position: relative;
    color: #4b5565;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .thinking-card::before {
    display: none;
  }

  .thinking-card summary {
    display: grid;
    grid-template-columns: 22px minmax(0, max-content) 14px;
    align-items: center;
    gap: 8px;
    width: fit-content;
    max-width: 100%;
    min-height: 30px;
    cursor: pointer;
    list-style: none;
    color: #3f4652;
  }

  .thinking-card summary::-webkit-details-marker {
    display: none;
  }

  .thinking-card__icon {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: linear-gradient(135deg, #b895ff, #d5c2ff);
    color: #1f2937;
  }

  .thinking-card__icon::before {
    display: none;
  }

  .thinking-card summary strong {
    display: block;
    overflow: hidden;
    color: #2f3540;
    font-size: 14px;
    font-weight: 560;
    letter-spacing: 0;
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .thinking-card summary em {
    display: block;
    margin-top: 1px;
    overflow: hidden;
    color: #7c828c;
    font-size: 11px;
    font-style: normal;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .thinking-card__chevron {
    color: #4b5563;
    transition: transform 0.18s ease;
  }

  .thinking-card__body {
    display: grid;
    gap: 8px;
    margin: 8px 0 0 14px;
    padding: 6px 0 4px 30px;
    border-left: 1px solid #c8d3e4;
  }

  .thinking-step {
    position: relative;
    display: block;
    padding: 1px 0 6px;
  }

  .thinking-step > span {
    display: none;
  }

  .thinking-step strong {
    display: block;
    margin-bottom: 8px;
    color: #6b7280;
    font-size: 13px;
    font-weight: 480;
  }

  .thinking-step p {
    position: relative;
    margin: 0 0 8px;
    color: #5f6673;
    font-size: 14px;
    line-height: 1.55;
  }

  .thinking-step p::before {
    content: "›";
    margin-right: 8px;
    color: #6b7280;
    font-weight: 600;
  }

  .thinking-step code,
  .thinking-step pre {
    display: block;
    width: 100%;
    margin: 6px 0 0;
    border: 0;
    border-radius: 6px;
    background: #f5f6f8;
    color: #5f6673;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .thinking-step code {
    padding: 6px 8px;
  }

  .thinking-step pre {
    max-height: 220px;
    overflow: auto;
    padding: 8px 9px;
  }

  .reasoning-card .thinking-step :global(.md) {
    color: #5f6774;
    font-size: 14px;
    line-height: 1.65;
  }

  .reasoning-card summary {
    grid-template-columns: 14px minmax(0, max-content);
    gap: 6px;
    min-height: 28px;
    padding: 5px 10px;
    border-radius: 7px;
    background: #eef0f3;
  }

  .reasoning-card .thinking-card__icon {
    width: 14px;
    height: 14px;
    border-radius: 0;
    background: transparent;
    color: #4b5563;
  }

  .reasoning-card summary strong {
    color: #3f4652;
    font-size: 10px;
    font-weight: 500;
  }

  .reasoning-card .thinking-card__chevron {
    display: none;
  }

  .tool-call-card--sub {
    margin-left: 8px;
  }

  @keyframes pending-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .decision-shelf {
    display: grid;
    gap: 14px;
    padding: 18px 20px;
  }

  .decision-shelf--ask {
    border-color: #ead7bd;
    background: #fff9f0;
  }

  .decision-shelf__head,
  .decision-shelf > div:first-child {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-width: 0;
  }

  .decision-shelf__icon,
  .decision-shelf > div:first-child > :global(svg) {
    flex: 0 0 auto;
    color: #333333;
    margin-top: 1px;
  }

  .decision-shelf__head strong,
  .decision-shelf > div:first-child strong {
    display: inline;
    color: #1f2937;
    font-size: 14px;
    font-weight: 650;
  }

  .decision-shelf__head div > span,
  .decision-shelf > div:first-child > span {
    display: inline;
    margin-left: 8px;
    color: #475467;
    font-size: 13px;
    line-height: 1.55;
  }

  .answer-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: 10px;
  }

  .answer-grid button {
    display: grid;
    gap: 8px;
    min-height: 88px;
    padding: 14px 16px;
    border: 1px solid #e2e5ec;
    border-radius: 10px;
    background: #ffffff;
    color: #1f2937;
    text-align: left;
    box-shadow: none;
  }

  .answer-grid button:hover {
    border-color: #c9ced8;
    background: #fbfcfe;
  }

  .answer-grid button.is-active {
    border-color: #222222;
    background: #f4f4f5;
    box-shadow: 0 0 0 2px rgba(34, 34, 34, 0.08);
  }

  .answer-grid strong {
    font-size: 14px;
    font-weight: 650;
  }

  .answer-grid span {
    color: #586174;
    font-size: 13px;
    line-height: 1.5;
  }

  .decision-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .decision-actions button {
    min-height: 34px;
    padding: 0 14px;
    border: 1px solid #d8dbe2;
    border-radius: 9px;
    background: #ffffff;
    color: #344054;
    font-size: 13px;
    font-weight: 500;
  }

  .decision-actions button:first-child {
    border-color: #222222;
    background: #222222;
    color: #ffffff;
  }

  .decision-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .decision-shelf pre {
    max-height: 180px;
    overflow: auto;
    margin: 0;
    padding: 12px;
    border-radius: 10px;
    background: #f8fafc;
    color: #475467;
    font-size: 12px;
    white-space: pre-wrap;
  }

  .tool-subcalls {
    display: grid;
    gap: 8px;
    margin-top: 10px;
  }

  .message--subtool {
    padding: 12px;
  }

  @media (max-width: 720px) {
    .message--user {
      max-width: 92%;
    }

    .answer-grid {
      grid-template-columns: 1fr;
    }

    .decision-actions {
      justify-content: stretch;
    }

    .decision-actions button {
      flex: 1 1 0;
    }
  }
</style>
