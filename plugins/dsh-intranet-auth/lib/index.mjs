const name = "@voltui/dsh-intranet-auth";
const inject = [];
const FETCH_MARKER = Symbol.for("voltui.dsh.intranet-auth.fetch");

function normalizedHostname(value) {
  return value.toLowerCase().replace(/^\[|\]$/gu, "");
}

function isPrivateIpv4(hostname) {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || octets[0] === 127;
}

function toURL(input) {
  try {
    if (typeof input === "string" || input instanceof URL) return new URL(input);
    if (typeof Request !== "undefined" && input instanceof Request) return new URL(input.url);
    return new URL(String(input));
  } catch {
    return undefined;
  }
}

export function isPrivateGatewayUrl(input) {
  const url = toURL(input);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return false;
  const hostname = normalizedHostname(url.hostname);
  return hostname === "localhost"
    || hostname === "::1"
    || hostname.endsWith(".local")
    || isPrivateIpv4(hostname);
}

function requestHeaders(input, init) {
  const headers = new Headers(typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
  if (init?.headers) {
    for (const [name, value] of new Headers(init.headers)) headers.set(name, value);
  }
  return headers;
}

function bearerValue(value) {
  const match = value?.match(/^Bearer\s+(.+)$/iu);
  return match?.[1]?.trim() || undefined;
}

export function createIntranetAuthFetch(originalFetch = globalThis.fetch) {
  if (typeof originalFetch !== "function") throw new TypeError("globalThis.fetch is unavailable");
  const wrapped = (input, init) => {
    if (!isPrivateGatewayUrl(input)) return originalFetch(input, init);
    const headers = requestHeaders(input, init);
    const authorization = bearerValue(headers.get("authorization"));
    const apiKey = headers.get("api-key")?.trim() || headers.get("x-api-key")?.trim();
    const value = authorization || apiKey;
    if (!value) return originalFetch(input, init);
    // Private OpenAI-compatible gateways vary between Authorization, api-key,
    // and x-api-key. Preserve explicit caller headers and only fill gaps.
    if (!headers.has("authorization")) headers.set("authorization", `Bearer ${value}`);
    if (!headers.has("x-api-key")) headers.set("x-api-key", value);
    if (!headers.has("api-key")) headers.set("api-key", value);
    return originalFetch(input, { ...init, headers });
  };
  Object.defineProperty(wrapped, FETCH_MARKER, { value: true });
  return wrapped;
}

export function apply() {
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== "function" || originalFetch[FETCH_MARKER]) return;
  const wrapped = createIntranetAuthFetch(originalFetch);
  globalThis.fetch = wrapped;
  return () => {
    if (globalThis.fetch === wrapped) globalThis.fetch = originalFetch;
  };
}

export { inject, name };
