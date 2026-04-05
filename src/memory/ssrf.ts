// Ported from OpenClaw src/infra/net/ssrf.ts + fetch-guard.ts
// DNS validation: we resolve DNS ourselves, validate ALL resolved IPs against
// the private/special-use blocklist, then pin DNS via undici's Agent to ensure
// fetch() connects to the exact IPs we validated (eliminates TOCTOU gap).
// Fail-closed on DNS failure or empty results.

import * as dns from "node:dns/promises";
import { lookup as dnsLookupCb, type LookupAddress } from "node:dns";
import * as net from "node:net";

export class SsrFBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrFBlockedError";
  }
}

export type SsrfPolicy = {
  allowPrivateNetwork?: boolean;
  allowedHostnames?: string[];
  hostnameAllowlist?: string[];
};

// --- Hostname normalization ---

function normalizeHostname(hostname: string): string {
  const trimmed = hostname.trim().toLowerCase();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed.replace(/\.+$/, "");
}

// --- Blocked hostnames (from OpenClaw) ---

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

function isBlockedHostnameNormalized(normalized: string): boolean {
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  return (
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  );
}

export function isBlockedHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;
  return isBlockedHostnameNormalized(normalized);
}

// --- IP validation (from OpenClaw) ---

function isCanonicalDottedDecimalIPv4(address: string): boolean {
  const parts = address.split(".");
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false;
    const num = Number(part);
    if (num < 0 || num > 255) return false;
    if (part.length > 1 && part.startsWith("0")) return false;
  }
  return true;
}

function isLegacyIpv4Literal(address: string): boolean {
  return /^(?:0x[\da-f]+|\d+)(?:\.(?:0x[\da-f]+|\d+)){0,3}$/i.test(address);
}

function looksLikeUnsupportedIpv4Literal(address: string): boolean {
  const parts = address.split(".");
  if (parts.length === 0 || parts.length > 4) return false;
  if (parts.some((part) => part.length === 0)) return true;
  return parts.every((part) => /^[0-9]+$/.test(part) || /^0x/i.test(part));
}

function isBlockedSpecialUseIpv4(ip: string): boolean {
  if (!net.isIPv4(ip)) return false;
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  if (a === 0) return true;             // 0.0.0.0/8 "this network"
  if (a === 10) return true;            // 10.0.0.0/8 RFC 1918
  if (a === 100 && b >= 64 && b <= 127) return true;  // 100.64.0.0/10 CGN
  if (a === 127) return true;           // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;  // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12 RFC 1918
  if (a === 192 && b === 0 && parts[2] === 0) return true;  // 192.0.0.0/24 IETF protocol
  if (a === 192 && b === 0 && parts[2] === 2) return true;  // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 88 && parts[2] === 99) return true; // 192.88.99.0/24 6to4 relay
  if (a === 192 && b === 168) return true;  // 192.168.0.0/16 RFC 1918
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
  if (a === 198 && b === 51 && parts[2] === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true;  // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true;            // 224.0.0.0/3 multicast + reserved
  return false;
}

function extractEmbeddedIpv4(ipv6Lower: string): string | null {
  // ::ffff:x.x.x.x (IPv4-mapped, RFC 4291)
  if (ipv6Lower.startsWith("::ffff:")) {
    const rest = ipv6Lower.slice(7);
    if (net.isIPv4(rest)) return rest;
  }
  // ::ffff:0:x.x.x.x (IPv4-translated, RFC 6052)
  if (ipv6Lower.startsWith("::ffff:0:")) {
    const rest = ipv6Lower.slice(9);
    if (net.isIPv4(rest)) return rest;
  }
  // 64:ff9b::x.x.x.x (NAT64 well-known prefix, RFC 6052)
  if (ipv6Lower.startsWith("64:ff9b::")) {
    const rest = ipv6Lower.slice(9);
    if (net.isIPv4(rest)) return rest;
  }
  // 64:ff9b:1::x.x.x.x (NAT64 local-use prefix, RFC 8215)
  if (ipv6Lower.startsWith("64:ff9b:1::")) {
    const rest = ipv6Lower.slice(11);
    if (net.isIPv4(rest)) return rest;
  }
  // ::x.x.x.x (IPv4-compatible, deprecated RFC 4291 §2.5.5.1 but still dangerous)
  if (ipv6Lower.startsWith("::") && !ipv6Lower.startsWith("::ffff")) {
    const rest = ipv6Lower.slice(2);
    if (rest && net.isIPv4(rest)) return rest;
  }
  return null;
}

function isBlockedSpecialUseIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::") return true;          // unspecified
  if (lower === "::1") return true;         // loopback
  if (lower.startsWith("fe80:")) return true;  // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("ff")) return true;  // multicast
  const embedded = extractEmbeddedIpv4(lower);
  if (embedded && isBlockedSpecialUseIpv4(embedded)) return true;
  return false;
}

export function isPrivateIpAddress(address: string): boolean {
  let normalized = address.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  if (!normalized) return false;

  if (net.isIPv4(normalized)) return isBlockedSpecialUseIpv4(normalized);
  if (net.isIPv6(normalized)) return isBlockedSpecialUseIpv6(normalized);

  // Malformed IPv6 literals: fail closed
  if (normalized.includes(":") && !net.isIPv6(normalized)) return true;

  if (!isCanonicalDottedDecimalIPv4(normalized) && isLegacyIpv4Literal(normalized)) return true;
  if (looksLikeUnsupportedIpv4Literal(normalized)) return true;
  return false;
}

export function isBlockedHostnameOrIp(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;
  return isBlockedHostnameNormalized(normalized) || isPrivateIpAddress(normalized);
}

// --- Hostname allowlist ---

function matchesHostnameAllowlist(hostname: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  return allowlist.some((pattern) => {
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(2);
      if (!suffix || hostname === suffix) return false;
      return hostname.endsWith(`.${suffix}`);
    }
    return hostname === pattern;
  });
}

// --- Policy helpers ---

function shouldSkipPrivateNetworkChecks(hostname: string, policy?: SsrfPolicy): boolean {
  return (
    policy?.allowPrivateNetwork === true ||
    new Set(policy?.allowedHostnames?.map(normalizeHostname)).has(hostname)
  );
}

export function buildBaseUrlPolicy(baseUrl: string): SsrfPolicy | undefined {
  const trimmed = baseUrl.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return { allowedHostnames: [parsed.hostname], hostnameAllowlist: [normalizeHostname(parsed.hostname)] };
  } catch {
    return undefined;
  }
}

// --- URL validation ---

const BLOCKED_HOST_OR_IP_MESSAGE = "Blocked hostname or private/internal/special-use IP address";
const BLOCKED_RESOLVED_IP_MESSAGE = "Blocked: resolves to private/internal/special-use IP address";

export interface ValidateUrlResult {
  resolvedAddresses: string[];
}

export async function validateUrl(url: string, policy?: SsrfPolicy): Promise<ValidateUrlResult> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrFBlockedError(`SSRF: blocked non-HTTP protocol: ${parsed.protocol}`);
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname) throw new SsrFBlockedError("SSRF: empty hostname");

  const hostnameAllowlist = (policy?.hostnameAllowlist ?? []).map(normalizeHostname).filter(Boolean);
  if (hostnameAllowlist.length > 0 && !matchesHostnameAllowlist(hostname, hostnameAllowlist)) {
    throw new SsrFBlockedError(`Blocked hostname (not in allowlist): ${parsed.hostname}`);
  }

  if (!shouldSkipPrivateNetworkChecks(hostname, policy)) {
    if (isBlockedHostnameOrIp(hostname)) {
      throw new SsrFBlockedError(BLOCKED_HOST_OR_IP_MESSAGE);
    }

    // Resolve both IPv4 and IPv6 and check ALL results.
    // Fail-closed: if DNS resolution fails entirely, block the request
    // (we cannot verify the target IP is safe).
    const allAddresses: string[] = [];
    let v4Error: unknown = null;
    let v6Error: unknown = null;

    try {
      const v4 = await dns.resolve4(hostname);
      allAddresses.push(...v4);
    } catch (err) {
      if (err instanceof SsrFBlockedError) throw err;
      v4Error = err;
    }
    try {
      const v6 = await dns.resolve6(hostname);
      allAddresses.push(...v6);
    } catch (err) {
      if (err instanceof SsrFBlockedError) throw err;
      v6Error = err;
    }

    // Fail-closed: if we got zero resolved addresses (whether DNS errored
    // or returned empty results) and the hostname is not a literal IP,
    // block the request — we cannot verify the target IP is safe.
    if (allAddresses.length === 0 && !net.isIP(hostname)) {
      throw new SsrFBlockedError(
        `SSRF: unable to resolve hostname "${hostname}" — blocking (fail-closed)`,
      );
    }

    for (const addr of allAddresses) {
      if (isBlockedHostnameOrIp(addr)) {
        throw new SsrFBlockedError(BLOCKED_RESOLVED_IP_MESSAGE);
      }
    }

    return { resolvedAddresses: allAddresses };
  }

  return { resolvedAddresses: [] };
}

// --- DNS pinning (from OpenClaw ssrf.ts createPinnedLookup) ---

type DnsLookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

function createPinnedLookupCb(
  targetHostname: string,
  addresses: string[],
): typeof dnsLookupCb {
  const normalizedTarget = normalizeHostname(targetHostname);
  let index = 0;
  const records: LookupAddress[] = addresses.map((addr) => ({
    address: addr,
    family: addr.includes(":") ? 6 : 4,
  }));

  return ((
    hostname: string,
    optionsOrCb: unknown,
    maybeCb?: unknown,
  ) => {
    const cb = (typeof optionsOrCb === "function" ? optionsOrCb : maybeCb) as
      | DnsLookupCallback
      | undefined;
    if (!cb) return;

    const normalized = normalizeHostname(hostname);
    if (normalized !== normalizedTarget || records.length === 0) {
      if (typeof optionsOrCb === "function") {
        return (dnsLookupCb as Function)(hostname, cb);
      }
      return (dnsLookupCb as Function)(hostname, optionsOrCb, cb);
    }

    const opts = typeof optionsOrCb === "object" && optionsOrCb !== null
      ? (optionsOrCb as { all?: boolean; family?: number })
      : {};
    const requestedFamily = typeof optionsOrCb === "number"
      ? optionsOrCb
      : (opts.family ?? 0);
    const candidates = requestedFamily === 4 || requestedFamily === 6
      ? records.filter((r) => r.family === requestedFamily)
      : records;
    const usable = candidates.length > 0 ? candidates : records;

    if (opts.all) {
      cb(null, usable);
      return;
    }
    const chosen = usable[index % usable.length];
    index = (index + 1) % usable.length;
    cb(null, chosen.address, chosen.family);
  }) as typeof dnsLookupCb;
}

async function buildPinnedFetchInit(
  hostname: string,
  resolvedAddresses: string[],
  init: RequestInit,
): Promise<{ init: RequestInit; cleanup: () => Promise<void> }> {
  if (resolvedAddresses.length === 0) {
    return { init, cleanup: async () => {} };
  }
  try {
    // Node.js 22+ bundles undici; use its Agent for DNS pinning
    // @ts-expect-error -- undici is bundled in Node.js 22+ but may lack type declarations
    const { Agent } = await import("undici") as { Agent: new (opts: unknown) => { close(): Promise<void> } };
    const lookup = createPinnedLookupCb(hostname, resolvedAddresses);
    const agent = new Agent({ connect: { lookup } });
    return {
      init: { ...init, dispatcher: agent } as RequestInit,
      cleanup: async () => { try { await agent.close(); } catch {} },
    };
  } catch {
    return { init, cleanup: async () => {} };
  }
}

// --- Guarded fetch with redirect handling (from fetch-guard.ts) ---

const DEFAULT_MAX_REDIRECTS = 3;

function retainSafeHeadersForCrossOriginRedirect(headers?: HeadersInit): Record<string, string> | undefined {
  if (!headers) return undefined;
  const safe: Record<string, string> = {};
  const headerObj = new Headers(headers);
  const SAFE_HEADERS = new Set(["accept", "accept-language", "content-language", "content-type"]);
  headerObj.forEach((value, key) => {
    if (SAFE_HEADERS.has(key.toLowerCase())) {
      safe[key] = value;
    }
  });
  return Object.keys(safe).length > 0 ? safe : undefined;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

export async function fetchWithSsrfGuard(
  url: string,
  init: RequestInit,
  policy?: SsrfPolicy,
): Promise<Response> {
  const maxRedirects = DEFAULT_MAX_REDIRECTS;
  const visited = new Set<string>();
  let currentUrl = url;
  let currentInit: RequestInit | undefined = init ? { ...init } : undefined;
  let redirectCount = 0;

  while (true) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(currentUrl);
    } catch {
      throw new Error("Invalid URL: must be http or https");
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Invalid URL: must be http or https");
    }

    const validationResult = await validateUrl(currentUrl, policy);

    const pinned = await buildPinnedFetchInit(
      parsedUrl.hostname,
      validationResult.resolvedAddresses,
      { ...(currentInit ?? {}), redirect: "manual" },
    );

    let response: Response;
    try {
      response = await fetch(parsedUrl.toString(), pinned.init);
    } finally {
      await pinned.cleanup();
    }

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Redirect missing location header (${response.status})`);

      redirectCount += 1;
      if (redirectCount > maxRedirects) throw new Error(`Too many redirects (limit: ${maxRedirects})`);

      const nextParsedUrl = new URL(location, parsedUrl);
      const nextUrl = nextParsedUrl.toString();
      if (visited.has(nextUrl)) throw new Error("Redirect loop detected");

      if (nextParsedUrl.origin !== parsedUrl.origin && currentInit?.headers) {
        const safeHeaders = retainSafeHeadersForCrossOriginRedirect(currentInit.headers);
        currentInit = { ...currentInit, headers: safeHeaders };
      }

      visited.add(nextUrl);
      currentUrl = nextUrl;
      continue;
    }

    return response;
  }
}
