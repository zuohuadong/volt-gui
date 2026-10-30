import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import http from "node:http";
import net from "node:net";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { urlToHttpOptions } from "node:url";
import { Agent } from "undici";

export const DEFAULT_NETWORK_MODE = "intranet";

export function networkMode() {
  return process.env.ANYONG_NETWORK_MODE === "external" ? "external" : DEFAULT_NETWORK_MODE;
}

function isPrivateIpv4(hostname) {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [first, second] = octets;
  return first === 10
    || first === 127
    || first === 169 && second === 254
    || first === 172 && second >= 16 && second <= 31
    || first === 192 && second === 168;
}

function isPrivateIpv6(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("fe8")
    || normalized.startsWith("fe9")
    || normalized.startsWith("fea")
    || normalized.startsWith("feb")
    || /^::ffff:(10|127|169\.254|172\.(1[6-9]|2\d|3[01])|192\.168)\./u.test(normalized);
}

export function isIntranetAddress(hostname) {
  return net.isIP(hostname) === 4
    ? isPrivateIpv4(hostname)
    : net.isIP(hostname) === 6 && isPrivateIpv6(hostname);
}

async function assertIntranetHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (isIntranetAddress(normalized)) return;
  let addresses;
  try {
    addresses = await dnsPromises.lookup(normalized, { all: true, verbatim: true });
  } catch {
    throw new Error(`内网模式拒绝无法解析的网络地址：${hostname}`);
  }
  if (addresses.length === 0 || addresses.some((entry) => !isIntranetAddress(entry.address))) {
    throw new Error(`内网模式拒绝公网网络地址：${hostname}`);
  }
}

function assertResolvedAddresses(hostname, addresses) {
  const normalized = Array.isArray(addresses) ? addresses : [{ address: addresses }];
  if (normalized.length === 0 || normalized.some((entry) => !isIntranetAddress(entry.address))) {
    throw new Error(`内网模式拒绝公网网络地址：${hostname}`);
  }
}

function guardedLookup(originalLookup) {
  return (hostname, options, callback) => {
    const requested = options && typeof options === "object" ? options : {};
    originalLookup(hostname, { ...requested, all: true, verbatim: true }, (error, addresses) => {
      if (error) {
        callback(error);
        return;
      }
      try {
        assertResolvedAddresses(hostname, addresses);
      } catch (policyError) {
        callback(policyError);
        return;
      }
      if (requested.all) {
        callback(null, addresses);
      } else {
        const first = addresses[0];
        callback(null, first.address, first.family);
      }
    });
  };
}

function guardRequest(module) {
  const originalRequest = module.request;
  const guarded = function (input, options, callback) {
    const base = typeof input === "string" || input instanceof URL
      ? urlToHttpOptions(new URL(input))
      : input;
    const requestOptions = { ...base, ...(typeof options === "object" ? options : {}) };
    const hostname = String(requestOptions.hostname || requestOptions.host || "localhost").replace(/^\[|\]$/gu, "");
    if (net.isIP(hostname) && !isIntranetAddress(hostname)) {
      throw new Error(`内网模式拒绝公网网络地址：${hostname}`);
    }
    const lookup = requestOptions.lookup || dns.lookup;
    const nextOptions = { ...requestOptions, lookup: guardedLookup(lookup) };
    return originalRequest.call(module, nextOptions, typeof options === "function" ? options : callback);
  };
  module.request = guarded;
  module.get = function (input, options, callback) {
    const request = guarded(input, options, callback);
    request.end();
    return request;
  };
}

export async function assertNetworkUrlAllowed(rawUrl, mode = networkMode()) {
  if (mode === "external") return;
  const url = rawUrl instanceof URL ? rawUrl : new URL(String(rawUrl));
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  await assertIntranetHost(url.hostname);
}

export function installNetworkPolicy() {
  if (networkMode() !== "intranet" || globalThis.__ANYONG_NETWORK_POLICY_INSTALLED__) return;
  globalThis.__ANYONG_NETWORK_POLICY_INSTALLED__ = true;
  const originalFetch = globalThis.fetch;
  const dispatcher = new Agent({ connect: { lookup: guardedLookup(dns.lookup) } });
  globalThis.fetch = async (input, init) => {
    const requestUrl = input instanceof Request ? input.url : String(input);
    await assertNetworkUrlAllowed(requestUrl);
    // 校验实际建连使用的 DNS 结果，不能只信任建连前的一次解析。
    const response = await originalFetch(input, { ...init, dispatcher, redirect: "manual" });
    const location = response.headers.get("location");
    if (location) await assertNetworkUrlAllowed(new URL(location, requestUrl));
    return response;
  };
  // 仅约束这些 Node 请求入口；原生工具与任意 socket 仍须由官方沙箱或系统网络策略隔离。
  guardRequest(http);
  guardRequest(https);
  syncBuiltinESMExports();
}

if (process.env.ANYONG_NETWORK_POLICY_PRELOAD === "1") installNetworkPolicy();
