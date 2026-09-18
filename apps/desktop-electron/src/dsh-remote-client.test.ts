import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WebSocketServer } from "ws";

import { DshRemoteClient, type DshRemoteEvent } from "./dsh-remote-client.ts";

const TOKEN = "A".repeat(43);

async function createFixture(options: { rpcResult?: unknown; failFirstExport?: boolean; stall?: "auth" | "rpc" | "body" } = {}) {
  const requests: Array<{ endpoint: string; args: unknown; cookie?: string }> = [];
  let connectionCount = 0;
  let exports = 0;
  let markBlocked!: () => void;
  const blocked = new Promise<void>((resolve) => { markBlocked = resolve; });
  const archive = Buffer.from("PK\u0003\u0004synthetic-complete-archive");
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/" && url.searchParams.get("token") === TOKEN) {
      if (options.stall === "auth") {
        markBlocked();
        return;
      }
      response.writeHead(303, { Location: "/", "Set-Cookie": "dsh-auth-fixture=session-value; HttpOnly; SameSite=Strict; Path=/" });
      response.end();
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/session.export") {
      exports += 1;
      response.writeHead(200, { "Content-Type": "application/zip", "Content-Length": archive.length });
      if (options.failFirstExport && exports === 1) {
        response.write(archive.subarray(0, 4));
        setTimeout(() => response.destroy(), 10);
      } else response.end(archive);
      return;
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/")) {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { rpcId: string; method: string; payload: { args: unknown } };
      requests.push({ endpoint: body.method, args: body.payload.args, cookie: request.headers.cookie });
      if (options.stall === "rpc" || options.stall === "body") {
        if (options.stall === "body") {
          response.writeHead(200, { "Content-Type": "application/json" });
          response.write("{");
        }
        markBlocked();
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      const result = options.rpcResult ?? { ok: true, value: { endpoint: body.method } };
      response.end(JSON.stringify({ type: "server-response", rpcId: body.rpcId, result }));
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
        ? { type: "ready", clientId: "client-fixture", host: { home: "C:\\Users\\fixture" } }
        : { type: "snapshot", records: [], hasMore: false };
      socket.send(JSON.stringify({ type: "item", streamId: message.streamId, value }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture address unavailable");
  return {
    requests,
    blocked,
    archive,
    get connectionCount() { return connectionCount; },
    startupUrl: `http://127.0.0.1:${address.port}/?token=${TOKEN}`,
    async close() {
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
      server.closeAllConnections();
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

for (const phase of ["auth", "rpc", "body"] as const) {
  test(`shutdown signal cancels a stalled ${phase} request`, { timeout: 5_000 }, async () => {
    const fixture = await createFixture({ stall: phase });
    try {
      const client = new DshRemoteClient(fixture.startupUrl);
      if (phase !== "auth") await client.authenticate();
      const controller = new AbortController();
      const running = phase === "auth" ? client.authenticate(controller.signal)
        : client.call("credentials/describe", {}, controller.signal);
      const rejected = assert.rejects(running, /synthetic shutdown/);
      await fixture.blocked;
      controller.abort(new Error("synthetic shutdown"));
      await rejected;
    } finally { await fixture.close(); }
  });
}

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
  } finally {
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

test("surfaces DSH business errors and codes empty failure payloads", async () => {
  const failed = await createFixture({
    rpcResult: { ok: false, error: { code: "auth", message: "provider route missing api key" } },
  });
  try {
    const client = new DshRemoteClient(failed.startupUrl);
    await client.authenticate();
    await assert.rejects(() => client.call("session/list"), (error: unknown) => {
      assert.equal(error instanceof Error ? error.message : "", "provider route missing api key");
      return true;
    });
  } finally {
    await failed.close();
  }

  const empty = await createFixture({ rpcResult: { ok: false } });
  try {
    const client = new DshRemoteClient(empty.startupUrl);
    await client.authenticate();
    await assert.rejects(() => client.call("session/list"), (error: unknown) => {
      assert.match(error instanceof Error ? error.message : "", /^VOLT_DSH_REQUEST_FAILED:/u);
      return true;
    });
  } finally {
    await empty.close();
  }
});

for (const existing of [false, true]) {
  test(`failed export preserves ${existing ? "the existing archive" : "an absent destination"} and permits retry`, async () => {
    const fixture = await createFixture({ failFirstExport: true });
    const root = await mkdtemp(path.join(os.tmpdir(), "volt-export-"));
    const destination = path.join(root, "session.zip");
    const original = "existing-archive";
    try {
      if (existing) await writeFile(destination, original);
      const client = new DshRemoteClient(fixture.startupUrl);
      await client.authenticate();
      await assert.rejects(client.exportSession("s1", destination), /^Error: VOLT_DSH_EXPORT_FAILED/);
      assert.deepEqual(await readdir(root), existing ? ["session.zip"] : []);
      if (existing) assert.equal(await readFile(destination, "utf8"), original);
      await client.exportSession("s1", destination);
      assert.deepEqual(await readFile(destination), fixture.archive);
      assert.deepEqual(await readdir(root), ["session.zip"]);
    } finally {
      await fixture.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("export write failures and directory destinations leave no partial files", async () => {
  const fixture = await createFixture();
  const root = await mkdtemp(path.join(os.tmpdir(), "volt-export-invalid-"));
  try {
    const client = new DshRemoteClient(fixture.startupUrl);
    await client.authenticate();
    await assert.rejects(client.exportSession("s1", path.join(root, "missing", "session.zip")), /VOLT_DSH_EXPORT_FAILED/);
    await assert.rejects(client.exportSession("s1", root), /VOLT_DSH_EXPORT_FAILED/);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await fixture.close();
    await rm(root, { recursive: true, force: true });
  }
});
