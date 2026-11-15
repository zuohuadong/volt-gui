type Input = { type: "write"; data: string; typed?: boolean } | { type: "resize"; cols: number; rows: number };
type Command = Input & { sequence: number };

/** 附件内的有界输入队列。ACK 只释放预算，不允许断线重放 shell 输入。 */
export class TerminalInputQueue {
  private sequence = 0;
  private pending: Array<{ command: Command; bytes: number }> = [];
  private inFlight: { command: Command; bytes: number } | undefined;
  private bufferedBytes = 0;
  private windowBytes = 0;
  private overhead = 128;
  private writable = false;
  private ready = false;
  private disposed = false;
  private readonly maxInputBytes: number;
  private readonly maxBufferedBytes: number;
  private readonly send: (command: Command) => boolean;

  constructor(
    maxInputBytes: number,
    maxBufferedBytes: number,
    send: (command: Command) => boolean,
  ) {
    this.maxInputBytes = maxInputBytes;
    this.maxBufferedBytes = maxBufferedBytes;
    this.send = send;
  }

  configure(frame: Record<string, unknown>): void {
    const window = frame.inputWindow as { maxBytes?: unknown; frameOverheadBytes?: unknown } | undefined;
    if (window && (!Number.isSafeInteger(window.maxBytes) || Number(window.maxBytes) <= 0
      || !Number.isSafeInteger(window.frameOverheadBytes) || Number(window.frameOverheadBytes) < 0)) {
      this.close();
      return;
    }
    this.windowBytes = window ? Number(window.maxBytes) : this.maxBufferedBytes;
    this.overhead = window ? Number(window.frameOverheadBytes) : 128;
    this.ready = true;
    this.setWritable(frame.writable === true);
  }

  setWritable(writable: boolean): void {
    this.writable = writable;
    if (!writable) {
      this.pending = [];
      this.bufferedBytes = this.inFlight?.bytes ?? 0;
    }
  }

  enqueue(input: Input): { accepted: boolean; reason?: string } {
    if (this.disposed || !this.ready || !this.writable) return { accepted: false, reason: "not-ready" };
    if (input.type === "write" && Buffer.byteLength(input.data, "utf8") > this.maxInputBytes) return { accepted: false, reason: "too-large" };
    const command = { ...input, sequence: this.sequence + 1 };
    const bytes = Buffer.byteLength(JSON.stringify(command), "utf8") + this.overhead;
    if (bytes > this.windowBytes || bytes > this.maxBufferedBytes) return { accepted: false, reason: "too-large" };
    if (this.bufferedBytes + bytes > this.maxBufferedBytes) return { accepted: false, reason: "backpressure" };
    this.sequence += 1;
    this.pending.push({ command, bytes });
    this.bufferedBytes += bytes;
    return { accepted: this.flush(), reason: this.disposed ? "not-sent" : undefined };
  }

  acknowledge(sequence: unknown): void {
    if (!this.inFlight || sequence !== this.inFlight.command.sequence) return;
    this.bufferedBytes -= this.inFlight.bytes;
    this.inFlight = undefined;
    this.flush();
  }

  close(): void {
    this.disposed = true;
    this.pending = [];
    this.inFlight = undefined;
    this.bufferedBytes = 0;
  }

  private flush(): boolean {
    if (this.disposed) return false;
    // 一次只发一帧，等官方 provider ACK 后再发下一帧，不耗尽 Remote inbox。
    if (this.inFlight || !this.pending.length) return true;
    const next = this.pending.shift()!;
    try {
      if (this.send(next.command)) {
        this.inFlight = next;
        return true;
      }
    } catch {
      // 发送结果未知时也不自动重放。
    }
    this.close();
    return false;
  }
}
