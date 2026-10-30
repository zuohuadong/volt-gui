import { describe, expect, it } from "vitest";
import { audioBase64, encodeWave } from "./voice-input";

describe("voice input WAV encoding", () => {
  it("writes a canonical mono 16 kHz PCM wave", () => {
    const bytes = encodeWave(new Float32Array([0, 0.5, -0.5]), 16_000);
    const view = new DataView(bytes.buffer);
    expect(bytes.byteLength).toBe(44 + 3 * 2);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.subarray(8, 12))).toBe("WAVE");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBeGreaterThan(16_000);
    expect(view.getInt16(48, true)).toBeLessThan(-16_000);
  });

  it("encodes binary audio without a data URL prefix", () => {
    const encoded = audioBase64(new Uint8Array([0, 1, 2, 255]));
    expect(encoded).toBe(btoa(String.fromCharCode(0, 1, 2, 255)));
    expect(encoded).not.toContain("data:");
  });
});
