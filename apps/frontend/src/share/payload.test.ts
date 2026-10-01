import { describe, expect, it } from "vitest";
import { decodeSharePayload, encodeSharePayload } from "./payload";

describe("share payload codec", () => {
  it("round-trips a level result", () => {
    const payload = { l: 12, n: 20, k: 18, ms: 55403 };
    expect(decodeSharePayload(encodeSharePayload(payload))).toEqual(payload);
  });

  it("round-trips a zero-correct run", () => {
    const payload = { l: 1, n: 20, k: 0, ms: 90000 };
    expect(decodeSharePayload(encodeSharePayload(payload))).toEqual(payload);
  });

  it("emits URL-safe base64 (no +, /, or =)", () => {
    // Crafted to exercise the URL-unsafe base64 alphabet on JSON bytes.
    const encoded = encodeSharePayload({ l: 1, n: 20, k: 1, ms: 999 });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain("=");
  });

  it.each([
    ["garbage", "not-json"],
    [btoa(JSON.stringify({ l: 12 })), "missing fields"],
    [
      btoa(JSON.stringify({ c: "1dx1d", n: 12, k: 10, ms: 4200 })),
      "old stats shape",
    ],
    [btoa(JSON.stringify({ l: 0, n: 20, k: 10, ms: 4200 })), "l=0"],
    [btoa(JSON.stringify({ l: 3, n: 0, k: 0, ms: 4200 })), "n=0"],
    [btoa(JSON.stringify({ l: 3, n: 20, k: 21, ms: 4200 })), "k exceeds n"],
    [btoa(JSON.stringify({ l: 3, n: 20, k: 10, ms: -1 })), "negative ms"],
    [btoa(JSON.stringify(null)), "null"],
  ])("rejects %s (%s)", (encoded) => {
    expect(decodeSharePayload(encoded)).toBeNull();
  });
});
