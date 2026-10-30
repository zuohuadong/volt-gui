export type VoiceCapture = {
  audioBase64: string;
  seconds: number;
};

export function encodeWave(samples: Float32Array, sampleRate = 16_000): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (const [index, sample] of samples.entries()) {
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, Math.round(value * (value < 0 ? 32_768 : 32_767)), true);
  }
  return bytes;
}

export function audioBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8_192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8_192));
  }
  return btoa(binary);
}

export class VoiceRecorder {
  private readonly maxSeconds: number;
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private context?: AudioContext;
  private chunks: Blob[] = [];
  private startedAt = 0;

  constructor(maxSeconds = 120) {
    this.maxSeconds = Math.max(1, maxSeconds);
  }

  get recording(): boolean {
    return this.recorder?.state === "recording";
  }

  async start(): Promise<void> {
    const devices = navigator.mediaDevices;
    if (!devices) throw new Error("voice-unavailable");
    if (typeof MediaRecorder === "undefined") throw new Error("voice-unavailable");
    let stream: MediaStream;
    try {
      stream = await devices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") throw new Error("voice-permission");
      if (error instanceof DOMException && (error.name === "NotFoundError" || error.name === "OverconstrainedError")) throw new Error("voice-device");
      throw error;
    }
    this.stream = stream;
    this.context = new AudioContext();
    this.chunks = [];
    this.recorder = new MediaRecorder(stream);
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.start();
    this.startedAt = performance.now();
  }

  async stop(): Promise<VoiceCapture> {
    const recorder = this.recorder;
    const context = this.context;
    if (!recorder || !context || recorder.state !== "recording") {
      await this.dispose();
      throw new Error("voice-empty");
    }
    try {
      await new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error("voice-empty"));
        recorder.stop();
      });
      this.stream?.getTracks().forEach((track) => track.stop());
      const blob = new Blob(this.chunks, { type: recorder.mimeType });
      if (blob.size === 0) throw new Error("voice-empty");
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      const duration = Math.min(decoded.duration, this.maxSeconds);
      const offline = new OfflineAudioContext(1, Math.max(1, Math.floor(duration * 16_000)), 16_000);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      const rendered = await offline.startRendering();
      return { audioBase64: audioBase64(encodeWave(rendered.getChannelData(0))), seconds: duration };
    } finally {
      await this.dispose();
    }
  }

  async cancel(): Promise<void> {
    await this.dispose();
  }

  private async dispose(): Promise<void> {
    if (this.recorder?.state === "recording") {
      try { this.recorder.stop(); } catch { /* already stopping */ }
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.recorder = undefined;
    this.chunks = [];
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== "closed") await context.close();
  }
}
