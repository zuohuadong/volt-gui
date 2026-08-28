#!/usr/bin/env node

const endpoint = process.env.XG_GOMODEL_ENDPOINT || "http://192.168.1.47:9010/v1";
const model = process.env.XG_GOMODEL_MODEL || "vlm";
const mode = process.env.XG_GOMODEL_SMOKE_MODE || "text";
const apiKey = process.env.XG_GOMODEL_API_KEY;

if (!apiKey) throw new Error("XG_GOMODEL_API_KEY is required");

const messageContent = mode === "image"
  ? [
      { type: "text", text: "Describe this image in one short sentence." },
      {
        type: "image_url",
        image_url: {
          url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        },
      },
    ]
  : "Reply with exactly VLM_OK.";
const response = await fetch(`${endpoint.replace(/\/$/, "")}/chat/completions`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${apiKey}`,
    "x-api-key": apiKey,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model,
    messages: [{
      role: "user",
      content: messageContent,
    }],
    max_tokens: 128,
    temperature: 0,
  }),
  signal: AbortSignal.timeout(180_000),
});

const payload = await response.json();
const answer = String(payload?.choices?.[0]?.message?.content ?? "").trim();
console.log(JSON.stringify({
  status: response.status,
  requestedModel: model,
  mode,
  servedModel: payload?.model,
  contentNonempty: answer.length > 0,
  finishReason: payload?.choices?.[0]?.finish_reason,
  errorCode: payload?.error?.code,
  errorType: payload?.error?.type,
  errorMessage: payload?.error?.message,
}));

if (!response.ok || answer.length === 0) process.exitCode = 1;
