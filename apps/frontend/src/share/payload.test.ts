import { describe, expect, it } from "vitest";
import { decodeSharePayload, encodeSharePayload } from "./payload";

describe("share payload codec", () => {
  it("round-trips a full payload", () => {
    const payload = { c: "1dx1d", n: 12, k: 10, ms: 4200 };
    expect(decodeSharePayload(encodeSharePayload(payload))).toEqual(payload);
  });

  it("round-trips a null avg time", () => {
    const payload = { c: "(4d)^2", n: 3, k: 0, ms: null };
    expect(decodeSharePayload(encodeSharePayload(payload))).toEqual(payload);
  });

  it("emits URL-safe base64 (no +, /, or =)", () => {
    // Crafted to exercise the URL-unsafe base64 alphabet on JSON bytes.
    const encoded = encodeSharePayload({ c: "(3d)^2", n: 1, k: 1, ms: 999 });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain("=");
  });

  it.each([
    ["garbage", "not-json"],
    [btoa(JSON.stringify({ c: "1dx1d" })), "missing fields"],
    [btoa(JSON.stringify({ c: "1dx1d", n: 0, k: 0, ms: null })), "n=0"],
    [btoa(JSON.stringify({ c: "1dx1d", n: 5, k: 9, ms: null })), "k exceeds n"],
    [btoa(JSON.stringify({ c: "1dx1d", n: 5, k: 5, ms: -1 })), "negative ms"],
    [btoa(JSON.stringify(null)), "null"],
  ])("rejects %s (%s)", (encoded) => {
    expect(decodeSharePayload(encoded)).toBeNull();
  });
});
