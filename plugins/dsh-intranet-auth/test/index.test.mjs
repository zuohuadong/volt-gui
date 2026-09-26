import assert from "node:assert/strict";
import test from "node:test";

import {
  createIntranetAuthFetch,
  isPrivateGatewayUrl,
} from "../lib/index.mjs";

test("recognizes private gateway addresses without treating public hosts as internal", () => {
  assert.equal(isPrivateGatewayUrl("http://192.168.1.47:9010/v1/models"), true);
  assert.equal(isPrivateGatewayUrl("http://10.2.3.4/v1/chat/completions"), true);
  assert.equal(isPrivateGatewayUrl("https://gateway.example.com/v1/models"), false);
});

test("copies the official Bearer credential to x-api-key only for private gateways", async () => {
  const calls = [];
  const fetch = createIntranetAuthFetch(async (input, init) => {
    calls.push({ url: String(input), headers: Object.fromEntries(new Headers(init?.headers)) });
    return new Response("ok", { status: 200 });
  });

  await fetch("http://192.168.1.47:9010/v1/models", {
    headers: { authorization: "Bearer unit-test-key" },
  });
  await fetch("https://gateway.example.com/v1/models", {
    headers: { authorization: "Bearer unit-test-key" },
  });
  await fetch("http://192.168.1.47:9010/v1/models", {
    headers: { authorization: "Bearer unit-test-key", "x-api-key": "existing" },
  });

  assert.equal(calls[0].headers.authorization, "Bearer unit-test-key");
  assert.equal(calls[0].headers["x-api-key"], "unit-test-key");
  assert.equal(calls[1].headers["x-api-key"], undefined);
  assert.equal(calls[2].headers["x-api-key"], "existing");
});

test("normalizes api-key and x-api-key requests without overwriting explicit headers", async () => {
  const calls = [];
  const fetch = createIntranetAuthFetch(async (_input, init) => {
    calls.push(Object.fromEntries(new Headers(init?.headers)));
    return new Response("ok");
  });

  await fetch("http://192.168.1.47:9010/v1/chat/completions", {
    headers: { "api-key": "api-key-value" },
  });
  await fetch("http://192.168.1.47:9010/v1/chat/completions", {
    headers: { "x-api-key": "x-api-key-value" },
  });
  await fetch("http://192.168.1.47:9010/v1/chat/completions", {
    headers: {
      authorization: "Bearer authorization-value",
      "api-key": "explicit-api-key",
      "x-api-key": "explicit-x-api-key",
    },
  });

  assert.deepEqual(calls, [
    {
      "api-key": "api-key-value",
      authorization: "Bearer api-key-value",
      "x-api-key": "api-key-value",
    },
    {
      "api-key": "x-api-key-value",
      authorization: "Bearer x-api-key-value",
      "x-api-key": "x-api-key-value",
    },
    {
      authorization: "Bearer authorization-value",
      "api-key": "explicit-api-key",
      "x-api-key": "explicit-x-api-key",
    },
  ]);
});
