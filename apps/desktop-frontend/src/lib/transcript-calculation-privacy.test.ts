import { render } from "svelte/server";
import { describe, expect, test } from "vitest";

import Transcript from "../components/Transcript.svelte";

function renderCalculation(body: string, error?: string) {
  return render(Transcript, {
    props: {
      items: [{ id: "calculation-1", role: "tool", title: "calculate", body, error }],
      loading: false,
      sending: false,
      onApprove: () => undefined,
      onAnswerAsk: () => undefined,
    },
  }).body;
}

describe("calculation transcript privacy", () => {
  test("keeps calculate arguments and output out of the process detail", () => {
    const transcript = renderCalculation('{"expression":"42 * 2","mode":"general"}\n{"value":"84"}');

    expect(transcript).toContain("数值校验");
    expect(transcript).toContain("后台校验");
    expect(transcript).not.toContain("expression");
    expect(transcript).not.toContain("general");
    expect(transcript).not.toContain("84");
    expect(transcript).not.toContain("calculate");
  });

  test("replaces calculation failures with a safe recovery message", () => {
    const transcript = renderCalculation('{"expression":"private formula"}', "calculator failed for private formula");

    expect(transcript).toContain("数值校验失败，请重试。");
    expect(transcript).not.toContain("private formula");
    expect(transcript).not.toContain("calculator failed");
  });
});
