import type { PromptContentPart } from "./dsh-client";

export type PendingPrompt = {
  sessionId: string;
  pendingId: string;
  text: string;
  images: Extract<PromptContentPart, { type: "image" }>[];
  files: File[];
};

export type ResponsePhase = "idle" | "submitting" | "running" | "waiting" | "stopping" | "disconnected";

const RESPONSE_INACTIVITY_TIMEOUT_MS = 70_000;
const TOOL_RESPONSE_INACTIVITY_TIMEOUT_MS = 180_000;

// 仅保存当前视图的临时交互状态；运行结果和历史仍以 DSH 为准。
export class SessionResponse {
  phase = $state<ResponsePhase>("idle");
  loading = $state(false);
  prompt = $state.raw<PendingPrompt>();
  failedPrompt = $state.raw<PendingPrompt>();
  sessionId = "";
  revision = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly onInactive: (sessionId: string) => void) {}

  get sending(): boolean {
    return this.phase === "submitting" || this.phase === "running" || this.phase === "stopping";
  }

  get canSubmit(): boolean {
    return !!this.sessionId && !this.loading && this.phase === "idle";
  }

  select(sessionId: string, running: boolean): void {
    this.clearTimer();
    this.revision += 1;
    this.sessionId = sessionId;
    this.loading = !!sessionId;
    this.phase = running ? "running" : "idle";
    this.prompt = undefined;
    this.failedPrompt = undefined;
  }

  begin(prompt: PendingPrompt): void {
    if (!this.canSubmit || prompt.sessionId !== this.sessionId) throw new Error("Session is not ready for a prompt");
    this.revision += 1;
    this.prompt = prompt;
    this.failedPrompt = undefined;
    this.phase = "submitting";
  }

  submitted(prompt: PendingPrompt): void {
    if (this.prompt !== prompt) return;
    this.phase = "running";
    this.armTimer(false);
  }

  activity(sessionId: string, toolRunning: boolean): void {
    if (sessionId !== this.sessionId || !this.prompt || this.phase !== "running") return;
    this.armTimer(toolRunning);
  }

  started(sessionId: string): void {
    if (sessionId !== this.sessionId || this.phase === "disconnected" || this.phase === "stopping" || this.phase === "waiting") return;
    this.phase = "running";
  }

  waitForInteraction(sessionId: string): void {
    if (sessionId !== this.sessionId || this.phase === "disconnected" || this.phase === "stopping") return;
    this.clearTimer();
    this.phase = "waiting";
  }

  resumeInteraction(sessionId: string, revision: number): void {
    if (sessionId !== this.sessionId || revision !== this.revision || this.phase !== "waiting") return;
    this.phase = "running";
    if (this.prompt) this.armTimer(false);
  }

  reconcile(running: boolean): void {
    if (this.prompt || !["idle", "running"].includes(this.phase)) return;
    this.phase = running ? "running" : "idle";
  }

  finish(sessionId: string): void {
    if (sessionId !== this.sessionId) return;
    this.clearTimer();
    this.revision += 1;
    this.prompt = undefined;
    this.failedPrompt = undefined;
    this.phase = "idle";
  }

  fail(sessionId: string): void {
    if (sessionId !== this.sessionId) return;
    const failed = this.prompt;
    this.finish(sessionId);
    this.failedPrompt = failed;
  }

  clearFailure(): void {
    this.failedPrompt = undefined;
  }

  async stop(stopAndReadRunning: () => Promise<boolean>): Promise<void> {
    if (!this.sessionId || this.phase === "stopping" || this.phase === "disconnected") return;
    const revision = ++this.revision;
    this.clearTimer();
    this.prompt = undefined;
    this.failedPrompt = undefined;
    this.phase = "stopping";
    try {
      const running = await stopAndReadRunning();
      if (this.revision === revision) this.phase = running ? "running" : "idle";
    } catch (error) {
      // 请求失败不能证明后台停止；保留停止入口，等待 DSH 后续确认。
      if (this.revision === revision) this.phase = "running";
      throw error;
    }
  }

  disconnect(): void {
    this.clearTimer();
    this.revision += 1;
    this.prompt = undefined;
    this.failedPrompt = undefined;
    this.phase = "disconnected";
    this.loading = false;
  }

  dispose(): void {
    this.select("", false);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private armTimer(toolRunning: boolean): void {
    this.clearTimer();
    const revision = this.revision;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.revision === revision && this.phase === "running") this.onInactive(this.sessionId);
    }, toolRunning ? TOOL_RESPONSE_INACTIVITY_TIMEOUT_MS : RESPONSE_INACTIVITY_TIMEOUT_MS);
  }
}
