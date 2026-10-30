import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { WebSocketServer } from "ws";

import { DshConnectionError, DshRemoteClient, DshStartupConnectionError, readMultipartFields, type DshRemoteEvent } from "./dsh-remote-client.ts";

const TOKEN = "A".repeat(43);

async function createFixture(options: { eventValue?: unknown; closeAfterStream?: boolean } = {}) {
  const requests: Array<{ endpoint: string; args: unknown; cookie?: string }> = [];
  let connectionCount = 0;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/" && url.searchParams.get("token") === TOKEN) {
      response.writeHead(303, { Location: "/", "Set-Cookie": "dsh-auth-fixture=session-value; HttpOnly; SameSite=Strict; Path=/" });
      response.end();
      return;
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/")) {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { rpcId: string; method: string; payload: { args: unknown } };
      requests.push({ endpoint: body.method, args: body.payload.args, cookie: request.headers.cookie });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ type: "server-response", rpcId: body.rpcId, result: { ok: true, value: { endpoint: body.method } } }));
      return;
    }
    response.writeHead(404).end();
  });
  const sockets = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/api/remote.mux" || request.headers.cookie !== "dsh-auth-fixture=session-value") {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client, request));
  });
  sockets.on("connection", (socket) => {
    connectionCount += 1;
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as { type: string; streamId: string; endpoint?: string };
      if (message.type !== "open") return;
      const value = message.endpoint === "$events"
        ? options.eventValue ?? { type: "ready", clientId: "client-fixture", host: { home: "C:\\Users\\fixture" } }
        : { type: "snapshot", records: [], hasMore: false };
      socket.send(JSON.stringify({ type: "item", streamId: message.streamId, value }));
      if (options.closeAfterStream) setTimeout(() => socket.close(), 0);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture address unavailable");
  return {
    requests,
    get connectionCount() { return connectionCount; },
    startupUrl: `http://127.0.0.1:${address.port}/?token=${TOKEN}`,
    async close() {
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

test("rejects startup URLs that could escape the managed loopback runtime", () => {
  for (const value of [
    `http://localhost:3000/?token=${TOKEN}`,
    `https://127.0.0.1:3000/?token=${TOKEN}`,
    `http://127.0.0.1:3000/other?token=${TOKEN}`,
    `http://127.0.0.1:3000/?token=${TOKEN}&extra=1`,
    "http://127.0.0.1:3000/",
  ]) assert.throws(() => new DshRemoteClient(value));
});

test("exchanges the startup token for a main-process Cookie and uses the new RPC envelope", async () => {
  const fixture = await createFixture();
  try {
    const client = new DshRemoteClient(fixture.startupUrl);
    await client.authenticate();
    assert.match(client.cleanOrigin, /^http:\/\/127\.0\.0\.1:\d+$/u);
    assert.deepEqual(await client.call("session/list", { _request: {} }), { endpoint: "session/list" });
    assert.deepEqual(fixture.requests, [{ endpoint: "session/list", args: { _request: {} }, cookie: "dsh-auth-fixture=session-value" }]);
  } finally {
    await fixture.close();
  }
});

test("decodes official multipart unary responses into Uint8Array values", async (t) => {
  let requestCount = 0;
  const fetchMock = t.mock.method(globalThis, "fetch", async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    requestCount += 1;
    if (requestCount === 1) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/", "Set-Cookie": "dsh-auth-fixture=session-value" },
      });
    }
    const request = JSON.parse(String(init?.body)) as { rpcId: string };
    const form = new FormData();
    form.append("metadata", JSON.stringify({
      type: "server-response",
      rpcId: request.rpcId,
      result: { ok: true, value: { attachment: null } },
      attachments: [{ codec: "bytes", part: "part-0", path: ["attachment"] }],
    }));
    form.append("part-0", new Blob([Uint8Array.from([1, 2, 3])], { type: "application/octet-stream" }), "part-0.bin");
    return new Response(form);
  });
  const client = new DshRemoteClient(`http://127.0.0.1:43123/?token=${TOKEN}`);

  await client.authenticate();
  const result = await client.call("session/attachment", { sessionId: "s1", attachmentId: "a1" }) as { attachment: Uint8Array };

  assert.deepEqual(Array.from(result.attachment), [1, 2, 3]);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("rejects oversized multipart responses before accepting their payload", async () => {
  const response = new Response("ignored", {
    headers: { "content-type": "multipart/form-data", "content-length": String(65 * 1024 * 1024) },
  });
  await assert.rejects(readMultipartFields(response), /超过大小限制/u);
});

test("proxies only authenticated MCP Apps host requests", async (t) => {
  const client = new DshRemoteClient(`http://127.0.0.1:43123/?token=${TOKEN}`);
  let requestCount = 0;
  const fetchMock = t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    requestCount += 1;
    const url = String(input);
    if (requestCount === 1) {
      return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": "dsh-auth-fixture=session-value" } });
    }
    assert.equal((init?.headers as Record<string, string>).Cookie, "dsh-auth-fixture=session-value");
    if (requestCount === 2) return new Response("not found", { status: 404 });
    assert.equal(url, "http://127.0.0.1:43123/api/mcp-apps/catalog");
    assert.equal(init?.method, "GET");
    return Response.json({ items: [] });
  });

  await client.authenticate();
  await assert.rejects(client.mcpAppsRequest("/api/mcp-apps/tool", "POST", { viewId: "view" }), /MCP Apps 请求失败|HTTP/);
  await assert.rejects(client.mcpAppsRequest("/api/session/list", "GET"), /路径不受支持/);
  await client.mcpAppsRequest("/api/mcp-apps/catalog", "GET");
  assert.equal(fetchMock.mock.callCount(), 3);
});

for (const location of ["/", "./", "//example.com/", "https://example.com/", "/other", "/?token=secret", "/#fragment", "http://127.0.0.1:43123/", ""]) {
  test(`authentication only accepts the official root redirect ${JSON.stringify(location)}`, async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      assert.equal(init?.redirect, "manual");
      return new Response(null, {
        status: 303,
        headers: { Location: location, "Set-Cookie": "dsh-auth-fixture=session-value" },
      });
    });
    const client = new DshRemoteClient(`http://127.0.0.1:43123/?token=${TOKEN}`);
    if (location === "/" || location === "./") {
      await client.authenticate();
      assert.equal(client.cleanOrigin, "http://127.0.0.1:43123");
    } else {
      await assert.rejects(client.authenticate(), /重定向目标无效/);
      assert.throws(() => client.cleanOrigin, /尚未完成认证/);
    }
    assert.equal(fetchMock.mock.callCount(), 1);
  });
}

test("retries a transient loopback authentication failure before accepting the DSH cookie", async (t) => {
  const client = new DshRemoteClient(`http://127.0.0.1:43123/?token=${TOKEN}`);
  let attempts = 0;
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    attempts += 1;
    if (attempts === 1) throw new TypeError("fetch failed");
    return new Response(null, {
      status: 303,
      headers: { Location: "/", "Set-Cookie": "dsh-auth-fixture=session-value" },
    });
  });

  await client.authenticate();

  assert.equal(attempts, 2);
  assert.equal(client.cleanOrigin, "http://127.0.0.1:43123");
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("does not retry a deterministic authentication response failure", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
  const client = new DshRemoteClient(`http://127.0.0.1:43123/?token=${TOKEN}`);

  await assert.rejects(client.authenticate(), /官方 DSH 认证失败（HTTP 503）/);

  assert.equal(fetchMock.mock.callCount(), 1);
});

test("reports an explicit startup connection error after bounded authentication retries", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });
  const client = new DshRemoteClient(`http://127.0.0.1:43123/?token=${TOKEN}`);

  await assert.rejects(client.authenticate(), (error: unknown) => {
    assert.ok(error instanceof DshStartupConnectionError);
    assert.match(error.message, /自动恢复已耗尽/);
    return true;
  });

  assert.equal(fetchMock.mock.callCount(), 9);
});

test("classifies a response-body disconnect as a connection error without replaying the mutation", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let callbacks = 0;
  globalThis.fetch = async (_input, init) => {
    requests += 1;
    if (init?.method === "POST") {
      return {
        ok: true,
        async json(): Promise<unknown> {
          throw new TypeError("response body stream closed");
        },
      } as Response;
    }
    return new Response(null, {
      status: 303,
      headers: { Location: "/", "Set-Cookie": "dsh-auth-fixture=session-value" },
    });
  };
  try {
    const client = new DshRemoteClient(`http://127.0.0.1:43123/?token=${TOKEN}`, () => { callbacks += 1; });
    await client.authenticate();
    await assert.rejects(client.call("session/create", { cwd: "C:\\workspace" }), (error: unknown) => {
      assert.ok(error instanceof DshConnectionError);
      return true;
    });
    assert.equal(requests, 2);
    assert.equal(callbacks, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

for (const stage of ["fetch", "body"] as const) {
  for (const failure of [
    new TypeError("transport failed"),
    new DOMException("timed out", "TimeoutError"),
    new DOMException("aborted", "AbortError"),
  ]) {
    test(`${stage} ${failure.name} notifies once and never replays a mutation`, async (t) => {
      const fixture = await createFixture();
      t.after(() => fixture.close());
      let callbacks = 0;
      const client = new DshRemoteClient(fixture.startupUrl, () => { callbacks += 1; });
      await client.authenticate();
      const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        if (stage === "fetch") throw failure;
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"type":'));
            controller.error(failure);
          },
        }));
      });
      await assert.rejects(client.call("session/create", {}), DshConnectionError);
      assert.equal(callbacks, 1);
      assert.equal(fetchMock.mock.callCount(), 1);
    });
  }
}

for (const kind of ["http", "json", "envelope", "business"] as const) {
  test(`${kind} failure does not signal connection loss or replay the request`, async (t) => {
    const fixture = await createFixture();
    t.after(() => fixture.close());
    let callbacks = 0;
    const client = new DshRemoteClient(fixture.startupUrl, () => { callbacks += 1; });
    await client.authenticate();
    const fetchMock = t.mock.method(globalThis, "fetch", async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      if (kind === "http") return new Response("", { status: 503 });
      if (kind === "json") return new Response("{");
      return Response.json({
        type: "server-response",
        rpcId: kind === "envelope" ? "wrong-id" : request.rpcId,
        result: { ok: false, error: { code: "DENIED", message: "not allowed", details: {} } },
      });
    });
    const expected = {
      http: /HTTP 503/,
      json: /JSON|property name/i,
      envelope: /关联信息/,
      business: /not allowed/,
    }[kind];
    await assert.rejects(client.call("session/create", {}), expected);
    assert.equal(callbacks, 0);
    assert.equal(fetchMock.mock.callCount(), 1);
  });
}

test("opens Remote streams with the authenticated mux protocol", async () => {
  const fixture = await createFixture();
  try {
    const client = new DshRemoteClient(fixture.startupUrl);
    await client.authenticate();
    assert.deepEqual(await client.readFirstStreamItem("session/follow", { request: { address: { kind: "session", sessionId: "s1" } } }), {
      type: "snapshot",
      records: [],
      hasMore: false,
    });
    const controller = new AbortController();
    const events: DshRemoteEvent[] = [];
    const running = client.runEvents((event) => {
      events.push(event);
      controller.abort();
    }, controller.signal);
    await running;
    assert.equal(events[0]?.type, "ready");
    assert.equal(client.currentEventClientId, "client-fixture");
    assert.equal(client.currentEventGeneration, 1);
  } finally {
    await fixture.close();
  }
});

test("treats an unexpected Remote stream close as an error", async () => {
  const fixture = await createFixture({ closeAfterStream: true });
  try {
    const client = new DshRemoteClient(fixture.startupUrl);
    await client.authenticate();
    const iterator = client.openStream("session/follow", {})[Symbol.asyncIterator]();
    assert.deepEqual(await iterator.next(), { done: false, value: { type: "snapshot", records: [], hasMore: false } });
    await assert.rejects(iterator.next(), /closed unexpectedly/);
  } finally {
    await fixture.close();
  }
});

test("does not publish event frames before a ready generation", async () => {
  const fixture = await createFixture({
    eventValue: { type: "emit", event: "unexpected", args: [] },
    closeAfterStream: true,
  });
  const client = new DshRemoteClient(fixture.startupUrl);
  const controller = new AbortController();
  const events: DshRemoteEvent[] = [];
  try {
    await client.authenticate();
    const running = client.runEvents((event) => events.push(event), controller.signal);
    await new Promise<void>((resolve) => setTimeout(resolve, 650));
    controller.abort();
    await running;
    assert.deepEqual(events, []);
    assert.ok(fixture.connectionCount >= 2);
    assert.equal(client.currentEventClientId, "");
  } finally {
    controller.abort();
    await fixture.close();
  }
});

test("does not create a WebSocket for a stream that was already cancelled", async () => {
  const fixture = await createFixture();
  try {
    const client = new DshRemoteClient(fixture.startupUrl);
    await client.authenticate();
    const controller = new AbortController();
    controller.abort();
    const iterator = client.openStream("session/follow", {}, controller.signal)[Symbol.asyncIterator]();
    assert.deepEqual(await iterator.next(), { done: true, value: undefined });
    assert.equal(fixture.connectionCount, 0);
  } finally {
    await fixture.close();
  }
});
