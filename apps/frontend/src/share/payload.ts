// Share-link payload (#?) — the results a player chooses to share, encoded
// base64url in the /share/<payload> URL so the OG card and landing page can
// render them with no server round-trip. Anyone can forge a payload — it's
// display-only self-reported data, never written anywhere — so validation
// here is about rejecting garbage URLs, not authenticity.

export type SharePayload = {
  c: string; // category codename as displayed ("1dx1d"), or "focus"
  n: number; // trials in the shared set
  k: number; // correct of those trials
  ms: number | null; // avg time on correct trials, ms
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
    const c = p.c,
      n = p.n,
      k = p.k,
      ms = p.ms;
    if (typeof c !== "string" || c.length === 0 || c.length > 24) return null;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 1e6)
      return null;
    if (typeof k !== "number" || !Number.isInteger(k) || k < 0 || k > n)
      return null;
    if (
      ms !== null &&
      (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0 || ms > 3.6e6)
    )
      return null;
    return { c, n, k, ms };
  } catch {
    return null;
  }
}
