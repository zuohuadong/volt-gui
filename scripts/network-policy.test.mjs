import assert from "node:assert/strict";
import http, { request as namedRequest } from "node:http";
import https from "node:https";
import { once } from "node:events";
import test from "node:test";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";

import { assertNetworkUrlAllowed, isIntranetAddress, installNetworkPolicy } from "./network-policy.mjs";

const originalLookup = dns.lookup;
let lookupOverride;
dns.lookup = (...args) => (lookupOverride ?? originalLookup)(...args);
installNetworkPolicy();
test.after(() => { dns.lookup = originalLookup; });

test("recognizes the supported private and loopback address ranges", () => {
  for (const address of ["10.0.0.1", "172.16.0.1", "172.31.255.254", "192.168.1.1", "127.0.0.1", "::1", "fc00::1", "fe80::1"]) {
    assert.equal(isIntranetAddress(address), true, address);
  }
  for (const address of ["11.0.0.1", "172.15.0.1", "172.32.0.1", "192.167.1.1", "8.8.8.8", "2001:4860:4860::8888"]) {
    assert.equal(isIntranetAddress(address), false, address);
  }
});

test("allows private literal URLs and rejects public literal URLs in intranet mode", async () => {
  await assert.doesNotReject(assertNetworkUrlAllowed("http://192.168.1.47:9010/v1"));
  await assert.doesNotReject(assertNetworkUrlAllowed("http://127.0.0.1:43123/"));
  await assert.doesNotReject(assertNetworkUrlAllowed("http://[::1]:43123/"));
  await assert.rejects(assertNetworkUrlAllowed("https://8.8.8.8/"), /公网网络地址/u);
});

test("external mode bypasses the intranet destination check", async () => {
  await assert.doesNotReject(assertNetworkUrlAllowed("https://example.com/", "external"));
});

test("blocks public literal HTTP requests before opening a socket", () => {
  assert.throws(() => http.request("http://8.8.8.8/"), /公网网络地址/u);
  assert.throws(() => namedRequest({ hostname: "8.8.8.8" }), /公网网络地址/u);
  assert.throws(() => https.get("https://8.8.8.8/"), /公网网络地址/u);
  assert.throws(() => http.get("http://[2001:4860:4860::8888]/"), /公网网络地址/u);
  assert.throws(() => http.request("http://127.0.0.1/", { hostname: "8.8.8.8" }), /公网网络地址/u);
});

test("blocks public hostname resolution through the HTTP lookup hook", async () => {
  await assert.rejects(new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "blocked.invalid",
      lookup(_hostname, _options, callback) {
        callback(null, [{ address: "8.8.8.8", family: 4 }]);
      },
    }, () => resolve());
    request.once("error", reject);
    request.end();
  }), /公网网络地址/u);
});

test("fetch rejects DNS rebinding at connection time", async (t) => {
  t.mock.method(dnsPromises, "lookup", async () => [{ address: "127.0.0.1", family: 4 }]);
  lookupOverride = (_hostname, _options, callback) => callback(null, [{ address: "8.8.8.8", family: 4 }]);
  try {
    await assert.rejects(fetch("http://rebind.invalid/"), error =>
      /公网网络地址/u.test(String(error.cause?.message ?? error.message)));
  } finally {
    lookupOverride = undefined;
  }
});

test("fetch preserves Request bodies and init while refusing public redirects", async () => {
  const server = http.createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "http://8.8.8.8/" });
      response.end();
      return;
    }
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => response.end(`${request.method}:${request.headers["x-anyong"]}:${body}`));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    const request = new Request(url, { method: "POST", body: "payload" });
    const response = await fetch(request, { headers: { "x-anyong": "test" } });
    assert.equal(await response.text(), "POST:test:payload");
    await assert.rejects(fetch(`${url}redirect`), /公网网络地址/u);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test("preserves URL, options, callbacks and private DNS HTTP requests", async () => {
  const server = http.createServer((_request, response) => response.end("ok"));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;
  const lookup = (_hostname, _options, callback) => callback(null, [{ address: "127.0.0.1", family: 4 }]);
  try {
    for (const input of [url, new URL(url), { host: "127.0.0.1", port }, { hostname: "private.invalid", port, lookup }]) {
      await new Promise((resolve, reject) => {
        http.get(input, (response) => {
          assert.equal(response.statusCode, 200);
          response.resume();
          response.once("end", resolve);
          response.once("error", reject);
        }).once("error", reject);
      });
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
