// Share-link payload — the level result a player chooses to share, encoded
// base64url in the /share/<payload> URL so the OG card and landing page can
// render them with no server round-trip. Anyone can forge a payload — it's
// display-only self-reported data, never written anywhere — so validation
// here is about rejecting garbage URLs, not authenticity.

export type SharePayload = {
  l: number; // level number
  n: number; // trials in the run
  k: number; // correct of those trials
  ms: number; // total run time, ms
};

export function encodeSharePayload(payload: SharePayload): string {
  return btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeSharePayload(encoded: string): SharePayload | null {
  try {
    const json = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const raw: unknown = JSON.parse(json);
    if (typeof raw !== "object" || raw === null) return null;
    const p = raw as Record<string, unknown>;
    const l = p.l,
      n = p.n,
      k = p.k,
      ms = p.ms;
    if (typeof l !== "number" || !Number.isInteger(l) || l < 1 || l > 9999)
      return null;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 1e6)
      return null;
    if (typeof k !== "number" || !Number.isInteger(k) || k < 0 || k > n)
      return null;
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0 || ms > 3.6e6)
      return null;
    return { l, n, k, ms };
  } catch {
    return null;
  }
}
