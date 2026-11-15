<script lang="ts">
  import { onMount } from "svelte";
  import { LoaderCircle, Square, Terminal as TerminalIcon, X } from "@lucide/svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import "@xterm/xterm/css/xterm.css";
  import { Button } from "$components/ui/button";
  import { t } from "$lib/i18n";

  interface Props {
    readonly sessionId: string;
    readonly onClose: () => void;
  }

  let { sessionId, onClose }: Props = $props();

  let host = $state<HTMLDivElement>();
  let phase = $state<"starting" | "ready" | "failed" | "closed">("starting");
  let failure = $state("");
  let terminalId = $state("");
  let writable = $state(false);

  let term: Terminal | undefined;
  let fit: FitAddon | undefined;
  let disposeFrames: (() => void) | undefined;
  let started = "";
  /** 已经交给主进程的终端身份；关闭时必须点名，避免误杀后来新建的终端。 */
  let ownedTerminalId = "";
  /** 输入被官方字节上限挡住时提示一次，而不是静默吞掉按键。 */
  let inputRejected = $state(false);

  const THEME = {
    background: "#0b0f17",
    foreground: "#d7dee8",
    cursor: "#7aa2f7",
    selectionBackground: "#2c3a55",
  };

  function write(text: string): void {
    term?.write(text);
  }

  async function start(): Promise<void> {
    if (started === sessionId || !host) return;
    started = sessionId;
    phase = "starting";
    failure = "";
    ownedTerminalId = crypto.randomUUID();
    terminalId = ownedTerminalId;
    const instance = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 12.5,
      scrollback: 4_000,
      theme: THEME,
      allowProposedApi: true,
    });
    const fitAddon = new FitAddon();
    instance.loadAddon(fitAddon);
    instance.open(host);
    fitAddon.fit();
    term = instance;
    fit = fitAddon;
    instance.onData((data) => {
      void window.voltDesktop?.writeTerminal?.(data, true).then((result) => {
        inputRejected = result?.accepted === false;
      });
    });
    instance.onResize(({ cols, rows }) => { void window.voltDesktop?.resizeTerminal?.(cols, rows); });
    try {
      const created = await window.voltDesktop?.startTerminal?.(sessionId, instance.cols, instance.rows, ownedTerminalId);
      if (created?.stale) {
        // 期间已经有更新的终端请求：这一次不再接管界面，也不再关闭别人的终端。
        phase = "closed";
        return;
      }
      if (!created?.terminalId) throw new Error(t("terminal.startFailed"));
      terminalId = created.terminalId;
      ownedTerminalId = created.terminalId;
      phase = "ready";
    } catch (error) {
      // 主进程可能已经 attach 了上一条终端：这里只报告，不假装成功。
      phase = "failed";
      failure = error instanceof Error ? error.message : String(error);
    }
  }

  onMount(() => {
    void start();
    const unsubscribe = window.voltDesktop?.onDshFrame?.((raw) => {
      const payload = (raw as { payload?: Record<string, unknown> } | null)?.payload;
      if (!payload || payload.type !== "terminal/frame") return;
      if (payload.sessionId !== sessionId || payload.terminalId !== terminalId) return;
      const frame = payload.frame && typeof payload.frame === "object" ? payload.frame as Record<string, unknown> : {};
      // 官方帧只有四种：快照、输出、状态、确认；未知形状直接忽略而不是猜。
      if (frame.type === "snapshot") {
        if (typeof frame.screen === "string") {
          term?.reset();
          write(frame.screen);
        }
        writable = frame.writable === true;
      } else if (frame.type === "output") {
        if (typeof frame.data === "string") write(frame.data);
      } else if (frame.type === "state") {
        writable = frame.writable === true;
      } else if (frame.type === "error") {
        phase = "failed";
        failure = typeof frame.message === "string" ? frame.message : t("terminal.streamFailed");
      }
    });
    const onResize = () => {
      try {
        fit?.fit();
      } catch {
        // 容器暂时不可见时 fit 会抛错：下一次 resize 再试即可。
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      unsubscribe?.();
      window.removeEventListener("resize", onResize);
      disposeFrames?.();
      void window.voltDesktop?.closeTerminal?.(ownedTerminalId || undefined);
      ownedTerminalId = "";
      term?.dispose();
      term = undefined;
    };
  });

  async function close(): Promise<void> {
    phase = "closed";
    const result = await window.voltDesktop?.closeTerminal?.(ownedTerminalId || undefined);
    // 官方 close 失败会保留终端等重试：如实显示，不能假装关掉了。
    if (result && result.closed === false) {
      phase = "failed";
      failure = result.error || t("terminal.closeFailed");
      return;
    }
    ownedTerminalId = "";
    onClose();
  }
</script>

<section class="terminal-panel" aria-label={t("terminal.title")}>
  <header>
    <TerminalIcon size={14} aria-hidden="true" />
    <strong>{t("terminal.title")}</strong>
    {#if terminalId}<small>{terminalId.slice(0, 8)}</small>{/if}
    {#if phase === "starting"}<small role="status"><LoaderCircle size={12} class="spin" aria-hidden="true" />{t("terminal.starting")}</small>{/if}
    {#if phase === "ready" && !writable}<small>{t("terminal.readOnly")}</small>{/if}
    <span class="terminal-actions">
      <Button variant="ghost" size="sm" title={t("terminal.closeHint")} onclick={() => void close()}>
        <Square size={11} fill="currentColor" aria-hidden="true" />{t("terminal.close")}
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={t("common.close")} onclick={() => void close()}><X size={13} /></Button>
    </span>
  </header>
  {#if inputRejected}
    <p class="terminal-error" role="status">{t("terminal.inputTooLarge")}</p>
  {/if}
  {#if phase === "failed"}
    <p class="terminal-error" role="status">{failure || t("terminal.startFailed")}</p>
  {/if}
  <div bind:this={host} class="terminal-host" data-phase={phase}></div>
</section>

<style>
  .terminal-panel { display: grid; grid-template-rows: auto 1fr; border: 1px solid var(--border); border-radius: 8px; margin: 10px 0; background: #0b0f17; overflow: hidden; }
  .terminal-panel > header { display: flex; align-items: center; gap: 6px; padding: 6px 10px; color: var(--muted-foreground); background: var(--card); border-bottom: 1px solid var(--border); }
  .terminal-panel > header strong { font-size: 12px; }
  .terminal-panel > header small { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
  .terminal-actions { margin-left: auto; display: inline-flex; align-items: center; gap: 2px; }
  .terminal-error { margin: 0; padding: 6px 10px; color: #f87171; font-size: 12px; }
  .terminal-host { height: 320px; padding: 6px 8px; }
</style>
