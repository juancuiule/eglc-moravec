import { beforeEach, describe, expect, it, vi } from "vitest";

const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

import PracticeModePage from "./page";

describe("PracticeModePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a valid decoded category", async () => {
    const result = await PracticeModePage({
      params: Promise.resolve({ mode: "2dx1d" }),
    });

    expect(result.props).toMatchObject({ categoryCodename: "2dx1d" });
  });

  it("404s for an already-decoded percent sign instead of decoding it again", async () => {
    await expect(
      PracticeModePage({ params: Promise.resolve({ mode: "%" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });
});
