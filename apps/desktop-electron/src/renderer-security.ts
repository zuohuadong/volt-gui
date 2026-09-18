const LOOPBACK_HOSTS = new Set(["127.0.0.1"]);

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopbackDshUrl(value: string): URL | null {
  const url = parseUrl(value);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:") || !LOOPBACK_HOSTS.has(url.hostname)) return null;
  return url;
}

export function isTrustedFrontendUrl(candidate: string, expectedFrontendUrl: string): boolean {
  const actual = parseUrl(candidate);
  const expected = parseUrl(expectedFrontendUrl);
  if (!actual || !expected || actual.protocol !== "file:" || expected.protocol !== "file:") return false;
  return actual.href === expected.href;
}

export function isAllowedNavigationUrl(candidate: string, expectedFrontendUrl: string, dshUrl?: string): boolean {
  if (isTrustedFrontendUrl(candidate, expectedFrontendUrl)) return true;
  const dsh = dshUrl ? isLoopbackDshUrl(dshUrl) : null;
  const target = parseUrl(candidate);
  if (!dsh || !target || target.protocol !== dsh.protocol) return false;
  return target.origin === dsh.origin;
}

export function isTrustedIpcSenderUrl(candidate: string, expectedFrontendUrl: string): boolean {
  return isTrustedFrontendUrl(candidate, expectedFrontendUrl);
}

export function isAllowedExternalUrl(candidate: string): boolean {
  const url = parseUrl(candidate);
  return url !== null && (url.protocol === "http:" || url.protocol === "https:")
    && !url.username && !url.password;
}
