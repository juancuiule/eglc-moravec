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

  it("decodes reserved category characters that Next keeps percent-encoded", async () => {
    const squaring = await PracticeModePage({
      params: Promise.resolve({ mode: "(2d)%5E2" }),
    });
    const addition = await PracticeModePage({
      params: Promise.resolve({ mode: "1d%2B1d" }),
    });

    expect(squaring.props.config.categoryCodename).toBe("(2d)^2");
    expect(addition.props.config.categoryCodename).toBe("1d+1d");
  });

  it("404s for malformed encoded input instead of throwing a URIError", async () => {
    await expect(
      PracticeModePage({ params: Promise.resolve({ mode: "%" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });
});
