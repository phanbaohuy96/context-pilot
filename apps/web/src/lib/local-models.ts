import dns from "node:dns/promises";
import net from "node:net";

// Lists models from a local OpenAI-compatible endpoint (Ollama, LM Studio, …) via its
// `/models` route, and probes the well-known local endpoints to auto-detect a running
// provider. Used by the /settings UI so the local model can be picked from a dropdown instead
// of typed, and the base URL auto-filled. The fetch runs server-side (a route handler), so it
// reaches the deployment's local LLM without CORS and without exposing it to the browser.
//
// Because the base URL is user-supplied and we fetch it server-side, this is an SSRF sink: an
// arbitrary URL would let a caller probe internal services or cloud metadata (169.254.169.254).
// This feature only ever targets a *local* LLM, so we hard-restrict the target to hosts that
// resolve exclusively to loopback, pin the vetted IP before fetching (closing the DNS-rebinding
// window), and refuse to follow redirects. Non-loopback URLs (incl. LAN) are rejected here; the
// UI keeps the model field free-text so a LAN/remote server can still be configured manually.

// Probed in order by auto-detect; the first that answers `/models` wins.
const KNOWN_LOCAL_BASE_URLS = [
  "http://localhost:11434/v1", // Ollama
  "http://localhost:1234/v1", // LM Studio
];

const PROBE_TIMEOUT_MS = 2_000;

function isLoopbackAddress(address: string): boolean {
  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) — unwrap to the embedded v4 literal.
  const v4 = address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
  if (net.isIPv4(v4)) {
    return v4.startsWith("127.");
  }
  if (net.isIPv6(address)) {
    return address === "::1";
  }
  return false;
}

// Validates `baseUrl` and returns a fetch-ready URL string pinned to a vetted loopback IP, or
// null when the host is not loopback. Pinning the resolved address (for http) closes the
// DNS-rebinding TOCTOU: a hostname is resolved once here and the *same* IP is fetched, rather
// than validating one resolution and letting fetch resolve again to a different (external) one.
async function resolveLoopbackTarget(baseUrl: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  // WHATWG URL returns IPv6 hosts bracketed (e.g. "[::1]"); strip them so net.isIP recognizes it.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    return isLoopbackAddress(host) ? url.toString() : null;
  }
  let resolved;
  try {
    resolved = await dns.lookup(host, { all: true });
  } catch {
    return null;
  }
  if (!resolved.length || !resolved.every((entry) => isLoopbackAddress(entry.address))) {
    return null;
  }
  // Pin to the vetted IP for http so fetch can't re-resolve to a different address. Keep the
  // hostname for https so TLS SNI/cert validation still works (local LLM servers are ~always http).
  // Prefer the IPv4 loopback: "localhost" resolves to [::1, 127.0.0.1] (IPv6 first) on most
  // systems, but local servers (Ollama/LM Studio) bind IPv4 127.0.0.1, so pinning ::1 would fail.
  if (url.protocol === "http:") {
    const pinned = resolved.find((entry) => net.isIPv4(entry.address))?.address ?? resolved[0].address;
    url.hostname = net.isIPv6(pinned) ? `[${pinned}]` : pinned;
  }
  return url.toString();
}

// True only when `baseUrl` is an http(s) URL whose host resolves exclusively to loopback.
export async function isLoopbackBaseUrl(baseUrl: string): Promise<boolean> {
  return (await resolveLoopbackTarget(baseUrl)) !== null;
}

export type LocalModelsResult = {
  baseUrl: string;
  models: string[];
};

// `GET {baseUrl}/models` on an OpenAI-compatible server returns `{ data: [{ id }] }`. Returns
// the sorted, de-duplicated model ids, or `null` when the endpoint is unreachable / times out /
// is not OpenAI-compatible (so callers can distinguish "no server here" from "server, no models").
export async function listLocalModels(baseUrl: string, apiKey?: string): Promise<string[] | null> {
  // SSRF guard: resolve+validate to a pinned loopback target, or refuse before any request.
  const target = await resolveLoopbackTarget(baseUrl);
  if (!target) {
    return null;
  }
  const url = `${target.replace(/\/$/, "")}/models`;
  try {
    const response = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      // Don't let a 3xx bounce the request off-loopback (e.g. to a metadata endpoint).
      redirect: "manual",
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { data?: Array<{ id?: unknown }> };
    if (!Array.isArray(body.data)) {
      return null;
    }
    const models = body.data
      .map((entry) => (typeof entry.id === "string" ? entry.id : null))
      .filter((id): id is string => Boolean(id));
    return Array.from(new Set(models)).sort((a, b) => a.localeCompare(b));
  } catch {
    // Unreachable endpoint / timeout / non-JSON: treat as "no local provider here".
    return null;
  }
}

// Probes the known local endpoints concurrently and returns the first (in priority order) that
// answers `/models`, so a down endpoint's timeout doesn't serialize in front of a live one.
export async function detectLocalProvider(apiKey?: string): Promise<LocalModelsResult | null> {
  const probes = await Promise.all(
    KNOWN_LOCAL_BASE_URLS.map(async (baseUrl) => ({ baseUrl, models: await listLocalModels(baseUrl, apiKey) })),
  );
  for (const probe of probes) {
    if (probe.models) {
      return { baseUrl: probe.baseUrl, models: probe.models };
    }
  }
  return null;
}
