import { describe, expect, it, vi } from "vitest";
import { getLocalLevelMix } from "./query";

vi.mock("./boot", () => ({
  bootLevelsCatalog: vi.fn(),
}));

import { bootLevelsCatalog } from "./boot";

describe("getLocalLevelMix", () => {
  it("returns null, not a thrown error, when the local database can't be opened", async () => {
    vi.mocked(bootLevelsCatalog).mockRejectedValue(new Error("IndexedDB blocked"));

    await expect(getLocalLevelMix(1)).resolves.toBeNull();
  });
});
