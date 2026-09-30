import { beforeEach, describe, expect, it, vi } from "vitest";

const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

import { FocusPracticePlay } from "@/components/FocusPracticePlay";
import PracticeModePage from "./page";

describe("PracticeModePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a valid decoded category", async () => {
    const result = await PracticeModePage({
      params: Promise.resolve({ mode: "2dx1d" }),
    });

    expect(result.props).toMatchObject({
      config: { mode: "category", categoryCodename: "2dx1d" },
    });
  });

  it("routes 'focus' to the adaptive session without hitting the codename validator", async () => {
    const result = await PracticeModePage({
      params: Promise.resolve({ mode: "focus" }),
    });

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(result.type).toBe(FocusPracticePlay);
  });

  it("404s for an already-decoded percent sign instead of decoding it again", async () => {
    await expect(
      PracticeModePage({ params: Promise.resolve({ mode: "%" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });
});
