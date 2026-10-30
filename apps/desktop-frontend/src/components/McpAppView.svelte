<script lang="ts">
  import type { DshClient } from "$lib/dsh-client";
  import type { McpAppDescriptor } from "$lib/ai-elements-adapter";

  type Props = {
    readonly app: McpAppDescriptor;
    readonly client: DshClient;
    readonly sessionId: string;
  };

  let { app, client, sessionId }: Props = $props();
  let frame = $state<HTMLIFrameElement>();
  let html = $state("");
  let sandboxUrl = $state("");
  let error = $state("");
  let loading = $state(true);
  let requestId = 0;

  function post(message: Record<string, unknown>): void {
    frame?.contentWindow?.postMessage(message, "null");
  }

  async function request(path: string, method: "GET" | "POST", body?: Record<string, unknown>): Promise<unknown> {
    return client.mcpAppsRequest(path, method, body);
  }

  async function load(): Promise<void> {
    try {
      const response = await request("/api/mcp-apps/view", "POST", { viewId: app.viewId });
      const view = response && typeof response === "object" ? response as Record<string, unknown> : {};
      if (typeof view.html !== "string" || view.html.length === 0 || view.html.length > 524288) {
        throw new Error("MCP App 资源为空或超过 512 KB");
      }
      html = view.html;
      sandboxUrl = `${app.sandboxOrigin}/sandbox.html?csp=${encodeURIComponent(JSON.stringify(view.csp ?? {}))}`;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading = false;
    }
  }

  async function handleMessage(event: MessageEvent<unknown>): Promise<void> {
    if (!frame?.contentWindow || event.source !== frame.contentWindow || event.origin !== "null") return;
    const message = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
    const id = message.id;
    const method = typeof message.method === "string" ? message.method : "";
    if (typeof id !== "string" && typeof id !== "number") return;
    if (!method || method.startsWith("ui/notifications/")) return;
    const response = (result: unknown) => post({ jsonrpc: "2.0", id, result });
    try {
      if (method === "ui/initialize") {
        response({
          protocolVersion: "2026-01-26",
          hostInfo: { name: "VoltUI", version: "0.1.0" },
          hostCapabilities: { openLinks: {}, downloadFile: {} },
          hostContext: { theme: "light", displayMode: "inline" },
        });
        if (app.result !== undefined) {
          post({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { result: app.result } });
        }
      } else if (method === "tools/call") {
        const params = record(message.params);
        response(await request("/api/mcp-apps/tool", "POST", {
          viewId: app.viewId,
          name: typeof params.name === "string" ? params.name : "",
          arguments: record(params.arguments),
          sessionId,
          connectionGeneration: app.connectionGeneration,
        }));
      } else if (method === "resources/read") {
        const params = record(message.params);
        response(await request("/api/mcp-apps/resource", "POST", { viewId: app.viewId, uri: params.uri }));
      } else if (method === "ui/update-model-context") {
        const params = record(message.params);
        await request("/api/mcp-apps/model-context", "POST", {
          viewId: app.viewId,
          sessionId,
          connectionGeneration: app.connectionGeneration,
          content: params.content,
          structuredContent: params.structuredContent,
        });
        response({});
      } else if (method === "ui/open-link") {
        const url = record(message.params).url;
        if (typeof url !== "string" || !/^https?:\/\/[^\s"'<>]+$/iu.test(url)) throw new Error("MCP App 只能打开 HTTP(S) 链接");
        await window.voltDesktop?.openExternal(url);
        response({});
      } else if (method === "ui/request-display-mode") {
        response({ mode: "inline" });
      } else {
        throw new Error(`MCP App 方法不受支持：${method}`);
      }
    } catch (cause) {
      post({ jsonrpc: "2.0", id, error: { code: -32000, message: cause instanceof Error ? cause.message : String(cause) } });
    }
  }

  function initializeFrame(): void {
    post({ jsonrpc: "2.0", method: "ui/notifications/sandbox-resource-ready", params: { html } });
    post({
      jsonrpc: "2.0",
      id: `volt-${++requestId}`,
      method: "ui/initialize",
      params: { protocolVersion: "2026-01-26", capabilities: {}, clientInfo: { name: "VoltUI", version: "0.1.0" } },
    });
  }

  function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  function withContentPolicy(source: string, cspValue: unknown): string {
    const csp = record(cspValue);
    const domains = (key: string, protocols: string[]) => Array.isArray(csp[key])
      ? csp[key].filter((item): item is string => typeof item === "string" && protocols.some((protocol) => item.startsWith(`${protocol}://`))).join(" ")
      : "";
    const policy = [
      "default-src 'none'",
      "script-src 'unsafe-inline' 'unsafe-eval' blob:",
      "style-src 'unsafe-inline'",
      `img-src 'self' data: blob: ${domains("resourceDomains", ["http", "https"])}`,
      `connect-src 'self' ${domains("connectDomains", ["http", "https", "ws", "wss"])}`,
      `frame-src 'self' ${domains("frameDomains", ["http", "https"])}`,
      "font-src 'self' data: blob:",
      "base-uri 'none'",
      "object-src 'none'",
    ].join("; ");
    return `<meta http-equiv="Content-Security-Policy" content="${policy}">${source}`;
  }

  $effect(() => {
    window.addEventListener("message", handleMessage);
    void load();
    return () => window.removeEventListener("message", handleMessage);
  });
</script>

{#if loading}
  <div class="mcp-app-status">正在加载交互界面…</div>
{:else if error}
  <div class="mcp-app-status mcp-app-status--error" role="alert">{error}</div>
{:else}
  <iframe bind:this={frame} title={app.title || "MCP App"} sandbox="allow-scripts" src={sandboxUrl} onload={initializeFrame}></iframe>
{/if}

<style>
  :global(.mcp-app-frame) { display: block; width: 100%; min-height: 260px; border: 0; background: transparent; }
  .mcp-app-status { padding: 18px; color: var(--muted-foreground); font-size: 12px; }
  .mcp-app-status--error { color: var(--destructive); }
  iframe { display: block; width: 100%; min-height: 260px; border: 0; background: transparent; }
</style>
